import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readline from "readline";
import Database from "better-sqlite3";
import { WorldState, SQLiteRepository } from "@omnia/core";
import { BufferRepository } from "@omnia/memory";
import { Architect, AliasDeltaGenerator } from "@omnia/architect";
import {
  ActorAgent,
  ActorPromptBuilder,
  IActorProseGenerator,
  buildBufferEntryForIntent,
} from "@omnia/actor";
import { GeminiProvider } from "@omnia/llm";
import { ScenarioLoader } from "@omnia/scenario";

// Load environment variables
dotenv.config();

class CLIProseGenerator implements IActorProseGenerator {
  async generate(
    entityId: string,
    systemPrompt: string,
    userContext: string,
  ): Promise<string> {
    console.log(
      "\n================================================================================",
    );
    console.log(`YOUR TURN: Playing as character "${entityId}"`);
    console.log(
      "================================================================================",
    );
    console.log(userContext);
    console.log(
      "================================================================================",
    );

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<string>((resolve) => {
      rl.question(
        "\nDescribe what your character does, says, or thinks (or type 'exit' to quit):\n> ",
        (answer) => {
          rl.close();
          const trimmed = answer.trim();
          if (trimmed.toLowerCase() === "exit") {
            console.log("\nExiting simulation. Goodbye!");
            process.exit(0);
          }
          resolve(trimmed);
        },
      );
    });
  }
}

/**
 * Checks for co-located entities who do not have subjective aliases for each other,
 * and calls the AliasDeltaGenerator to synthesize names based on visible attributes.
 */
async function runAliasResolution(
  worldState: WorldState,
  aliasGenerator: AliasDeltaGenerator,
  coreRepo: SQLiteRepository,
): Promise<void> {
  const entities = Array.from(worldState.entities.values());
  for (const viewer of entities) {
    if (!viewer.locationId) continue;

    for (const target of entities) {
      if (viewer.id === target.id) continue;
      if (target.locationId === viewer.locationId) {
        if (!viewer.aliases.has(target.id)) {
          const alias = await aliasGenerator.generate(viewer, target);
          viewer.aliases.set(target.id, alias);
          console.log(
            `\n[Alias Resolved] "${viewer.id}" sees "${target.id}" -> alias: "${alias}"`,
          );
          // Save the viewer state with the new alias
          coreRepo.saveEntity(viewer, worldState.id);
        }
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  const logFileIndex = args.indexOf("--log-file");
  let logStream: fs.WriteStream | undefined;
  if (logFileIndex !== -1 && args[logFileIndex + 1]) {
    const logFilePath = path.resolve(args[logFileIndex + 1]);
    logStream = fs.createWriteStream(logFilePath, {
      flags: "w",
      encoding: "utf-8",
    });

    // Monkeypatch console.log
    const originalLog = console.log;
    console.log = (...messageArgs: unknown[]) => {
      originalLog(...messageArgs);
      const text =
        messageArgs
          .map((arg) => {
            if (typeof arg === "object" && arg !== null) {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(" ") + "\n";
      logStream?.write(text);
    };

    // Monkeypatch console.error
    const originalError = console.error;
    console.error = (...messageArgs: unknown[]) => {
      originalError(...messageArgs);
      const text =
        messageArgs
          .map((arg) => {
            if (typeof arg === "object" && arg !== null) {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(" ") + "\n";
      logStream?.write("[ERROR] " + text);
    };

    process.on("exit", () => {
      logStream?.end();
    });
  }
  const scenarioArgIndex = args.indexOf("--scenario");
  const scenarioPath =
    scenarioArgIndex !== -1
      ? args[scenarioArgIndex + 1]
      : "content/demo/scenarios/talking-room.json";

  const playArgIndex = args.indexOf("--play");
  const playEntityId = playArgIndex !== -1 ? args[playArgIndex + 1] : undefined;

  const dbPath = path.resolve("./omnia.db");
  console.log(`Initializing SQLite database at: ${dbPath}`);

  const db = new Database(dbPath);
  const coreRepo = new SQLiteRepository(db);
  const bufferRepo = new BufferRepository(db);
  const loader = new ScenarioLoader(coreRepo, bufferRepo);

  // 1. Read Scenario JSON file
  if (!fs.existsSync(scenarioPath)) {
    console.error(
      `Error: Scenario template file not found at: ${scenarioPath}`,
    );
    process.exit(1);
  }

  console.log(`Loading scenario template from: ${scenarioPath}`);
  const scenarioJson = JSON.parse(fs.readFileSync(scenarioPath, "utf-8"));

  // 2. Initialize World Instance
  const worldInstanceId = `run-${Date.now()}`;
  console.log(`Initializing live world instance: ${worldInstanceId}`);
  await loader.initializeWorld(scenarioJson, worldInstanceId);

  // Load the running world state
  const worldState = coreRepo.loadWorldState(worldInstanceId);
  if (!worldState) {
    console.error(
      `Error: Failed to load initialized world state: ${worldInstanceId}`,
    );
    process.exit(1);
  }

  // Resolve playEntityId to actual entity UUID if name/ID substring matches
  let resolvedPlayEntityId: string | undefined = undefined;
  if (playEntityId) {
    let matched = worldState.getEntity(playEntityId);
    if (!matched) {
      for (const ent of worldState.entities.values()) {
        const nameAttr = ent.attributes.get("name")?.getValue();
        if (nameAttr && nameAttr.toLowerCase() === playEntityId.toLowerCase()) {
          matched = ent;
          break;
        }
      }
    }
    if (!matched) {
      for (const ent of worldState.entities.values()) {
        const nameAttr = ent.attributes.get("name")?.getValue();
        if (
          (nameAttr && nameAttr.toLowerCase().includes(playEntityId.toLowerCase())) ||
          ent.id.toLowerCase().includes(playEntityId.toLowerCase())
        ) {
          matched = ent;
          break;
        }
      }
    }

    if (matched) {
      resolvedPlayEntityId = matched.id;
      console.log(`Resolved player character "${playEntityId}" to entity ID "${matched.id}" (Name: ${matched.attributes.get("name")?.getValue() || "Unnamed"})`);
    } else {
      console.warn(`Warning: Could not find any entity matching "${playEntityId}". Running in observer mode.`);
    }
  }

  // 3. Ensure API Key exists if we are running LLMs
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("Error: GOOGLE_API_KEY environment variable is missing.");
    console.error(
      "Please provide it in your .env file to enable LLM generators and decoders.",
    );
    process.exit(1);
  }

  const llmProvider = new GeminiProvider(apiKey);
  const architect = new Architect(llmProvider, coreRepo);
  const aliasGenerator = new AliasDeltaGenerator(llmProvider);

  console.log(
    "\n================================================================================",
  );
  console.log(`SIMULATION STARTED: "${scenarioJson.name}"`);
  console.log(`Description: ${scenarioJson.description}`);
  if (resolvedPlayEntityId) {
    const matched = worldState.getEntity(resolvedPlayEntityId);
    console.log(`Player Role: Controlling entity "${resolvedPlayEntityId}" (Name: ${matched?.attributes.get("name")?.getValue() || "Unnamed"})`);
  } else {
    console.log("Player Role: Observing fully autonomous NPC run");
  }
  console.log(
    "================================================================================",
  );

  const isVerbose = args.includes("--verbose");

  let turnCount = 1;
  const maxTurns = 20; // safe loop breaker

  while (turnCount <= maxTurns) {
    console.log(
      `\n\n--- TURN ${turnCount} (World Time: ${worldState.clock.get().toISOString()}) ---`,
    );

    // Reload world state from database to ensure fresh DB sync
    const currentWorldState = coreRepo.loadWorldState(worldInstanceId);
    if (!currentWorldState) {
      console.error("Error: Synced world state lost.");
      process.exit(1);
    }

    // Auto-resolve aliases for co-located entities who don't know each other yet
    await runAliasResolution(currentWorldState, aliasGenerator, coreRepo);

    const entities = Array.from(currentWorldState.entities.values());

    for (const entity of entities) {
      // 1. Determine the ActorAgent generator: CLI input for player, LLM for NPCs
      const isPlayer = resolvedPlayEntityId && entity.id === resolvedPlayEntityId;
      const generator = isPlayer ? new CLIProseGenerator() : undefined;

      const agent = new ActorAgent(llmProvider, bufferRepo, 20, generator);

      // Verbose mode: Output the generated prompt builder context before generation
      if (isVerbose) {
        const promptBuilder = new ActorPromptBuilder(bufferRepo, 20);
        const { systemPrompt, userContext } = promptBuilder.build(
          currentWorldState,
          entity,
        );
        console.log(`\n[VERBOSE] Assembled Prompts for "${entity.id}":`);
        console.log("\n--- SYSTEM PROMPT ---");
        console.log(systemPrompt);
        console.log("\n--- USER CONTEXT ---");
        console.log(userContext);
        console.log("\n--- CONTEXT BREAKDOWN ---");

        const userSections = userContext.split("\n\n");
        const momentSection =
          userSections.find((s) => s.startsWith("=== CURRENT MOMENT ===")) ||
          "";
        const worldSection =
          userSections.find((s) =>
            s.startsWith("=== THE WORLD AS YOU PERCEIVE IT ==="),
          ) || "";
        const memorySection =
          userSections.find((s) =>
            s.startsWith("=== YOUR RECENT MEMORY ==="),
          ) || "";

        const systemChars = systemPrompt.length;
        const momentChars = momentSection.length;
        const worldChars = worldSection.length;
        const memoryChars = memorySection.length;
        const totalChars = systemChars + userContext.length;

        const estTokens = (chars: number) => Math.ceil(chars / 4);

        console.log(
          `  ├─ System Instructions:   ${systemChars.toLocaleString()} chars (~${estTokens(systemChars)} tokens)`,
        );
        console.log(
          `  ├─ Current Moment Context: ${momentChars.toLocaleString()} chars (~${estTokens(momentChars)} tokens)`,
        );
        console.log(
          `  ├─ World Perception:      ${worldChars.toLocaleString()} chars (~${estTokens(worldChars)} tokens)`,
        );
        console.log(
          `  ├─ Recent Memory Buffer:  ${memoryChars.toLocaleString()} chars (~${estTokens(memoryChars)} tokens)`,
        );
        console.log(
          `  └─ TOTAL ESTIMATED INPUT: ${totalChars.toLocaleString()} chars (~${estTokens(totalChars)} tokens)`,
        );
        console.log(
          "--------------------------------------------------------------------------------",
        );
      }

      if (!isPlayer) {
        console.log(`\n[${entity.id}] is thinking...`);
      }

      // 2. Execute character turn
      const turnResult = await agent.act(currentWorldState, entity);

      if (!isPlayer) {
        console.log(`\n[${entity.id}]: ${turnResult.narrativeProse}`);
      } else {
        console.log(`\n[You]: ${turnResult.narrativeProse}`);
      }

      // Verbose mode: Output decoded intent structures
      if (isVerbose) {
        console.log(`\n[VERBOSE] Decoded Intents from Prose:`);
        console.log(JSON.stringify(turnResult.intents.intents, null, 2));
        console.log(
          "--------------------------------------------------------------------------------",
        );
      }

      // 3. Process each generated intent sequence through physics and memory
      for (const intent of turnResult.intents.intents) {
        const outcome = await architect.processIntent(
          currentWorldState,
          intent,
        );
        const timestamp = currentWorldState.clock.get().toISOString();

        // Verbose mode: Output architect evaluation
        if (isVerbose) {
          console.log(`\n[VERBOSE] Architect Intent Processing:`);
          console.log(`  Type: ${intent.type}`);
          console.log(`  Description: "${intent.description}"`);
          if (intent.type === "monologue") {
            console.log("  Validation: Bypassed (monologue)");
          } else {
            console.log(
              `  Validation Result: isValid = ${outcome.isValid}, reason = "${outcome.reason}"`,
            );
            if (outcome.timeDelta) {
              console.log(
                `  Clock Delta: +${outcome.timeDelta.minutesToAdvance} min (${outcome.timeDelta.explanation})`,
              );
            }
          }
          console.log(
            "--------------------------------------------------------------------------------",
          );
        }

        // Save actor's subjective memory
        const actorEntry = buildBufferEntryForIntent(
          intent,
          timestamp,
          entity.locationId,
        );
        if (intent.type === "action") {
          actorEntry.outcome = {
            isValid: outcome.isValid,
            reason: outcome.reason,
          };
        }
        bufferRepo.save(actorEntry);

        // Propagate public memories (dialogue/actions) to co-located observers
        if (
          entity.locationId &&
          (intent.type === "dialogue" || intent.type === "action")
        ) {
          for (const other of currentWorldState.entities.values()) {
            if (
              other.id !== entity.id &&
              other.locationId === entity.locationId
            ) {
              const observerEntry = buildBufferEntryForIntent(
                intent,
                timestamp,
                entity.locationId,
              );
              if (intent.type === "action") {
                observerEntry.outcome = {
                  isValid: outcome.isValid,
                  reason: outcome.reason,
                };
              }
              bufferRepo.save({
                ...observerEntry,
                ownerId: other.id,
              });
            }
          }
        }

        // Print formatted logs
        if (intent.type === "monologue") {
          if (isPlayer) {
            console.log(`  (Thought processed: "${intent.description}")`);
          }
        } else if (intent.type === "dialogue") {
          console.log(
            `  (Dialogue spoken: spoken to ${intent.targetIds.join(", ") || "someone"})`,
          );
        } else {
          console.log(
            `  (Action result: ${outcome.isValid ? "Success" : `Failed - ${outcome.reason}`})`,
          );
        }
      }

      // 4. Save synced world state to repository
      coreRepo.saveWorldState(currentWorldState);
    }

    turnCount++;
  }

  console.log("\nSimulation execution limit reached. Goodbye!");
  db.close();
}

main().catch((err) => {
  console.error("Simulation run aborted due to error:", err);
  process.exit(1);
});
