import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SQLiteRepository } from "@omnia/core";
import { Location } from "@omnia/spatial";
import { BufferRepository } from "@omnia/memory";
import { ScenarioLoader, ScenarioSchema } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCENARIO_PATH = path.resolve(
  __dirname,
  "../../../content/demo/scenarios/talking-room.json",
);

describe("Talking Room Demo Scenario Test (Tier 1)", () => {
  test("talking-room.json exists, parses, and loads correctly into database", async () => {
    // 1. Verify file exists
    expect(fs.existsSync(SCENARIO_PATH)).toBe(true);

    // 2. Read and parse JSON
    const rawJson = fs.readFileSync(SCENARIO_PATH, "utf-8");
    const scenarioJson = JSON.parse(rawJson);
    const parsed = ScenarioSchema.safeParse(scenarioJson);
    expect(parsed.success).toBe(true);

    // 3. Setup SQLite and loader
    const db = new Database(":memory:");
    const coreRepo = new SQLiteRepository(db);
    const bufferRepo = new BufferRepository(db);
    const loader = new ScenarioLoader(coreRepo, bufferRepo);

    const worldInstanceId = "run-talking-room-1";
    await loader.initializeWorld(scenarioJson, worldInstanceId);

    // 4. Assert WorldState
    const world = coreRepo.loadWorldState(worldInstanceId);
    expect(world).not.toBeNull();
    expect(world!.attributes.get("name")?.getValue()).toBe("Talking Room");
    expect(world!.attributes.get("name")?.visibility).toBe("PRIVATE");
    expect(world!.attributes.get("description")?.getValue()).toBe(
      scenarioJson.description,
    );
    expect(world!.attributes.get("description")?.visibility).toBe("PRIVATE");
    expect(world!.attributes.get("experiment_codename")?.getValue()).toBe(
      "Project Tabula Rasa (Phase 3)",
    );
    expect(world!.attributes.get("experiment_codename")?.visibility).toBe(
      "PRIVATE",
    );
    expect(
      world!.attributes.get("experiment_codename")?.getAllowedEntities(),
    ).toHaveLength(0); // System only!

    // 5. Assert location
    const locations = coreRepo.listLocations(
      worldInstanceId,
      (id, parentId) => new Location(id, parentId),
    );
    expect(locations).toHaveLength(1);
    expect(locations[0].id).toBe("white-room");
    expect(locations[0].attributes.get("description")?.getValue()).toContain(
      "A pristine, featureless room",
    );

    // 6. Assert entities and their private attributes / allowedEntities
    const alphaId = "7c9b83b3-8cfb-4e89-8d77-626a5757d591";
    const betaId = "bf3f29d2-cf11-4b11-9a99-b13c126d400e";

    const alpha = world!.getEntity(alphaId);
    expect(alpha).toBeDefined();
    expect(alpha!.locationId).toBe("white-room");

    // Name visibility check
    const alphaName = alpha!.attributes.get("name")!;
    expect(alphaName.getValue()).toBe("Bob");
    expect(alphaName.visibility).toBe("PRIVATE");
    expect(alphaName.hasAccess(alphaId)).toBe(true);
    expect(alphaName.hasAccess(betaId)).toBe(false);

    // Check system-only attribute (neural_erasure_dose)
    const alphaDose = alpha!.attributes.get("neural_erasure_dose")!;
    expect(alphaDose.visibility).toBe("PRIVATE");
    expect(alphaDose.hasAccess(alphaId)).toBe(false);
    expect(alphaDose.hasAccess(betaId)).toBe(false);

    // Verify subjective aliases are initially undefined
    expect(alpha!.aliases.get(betaId)).toBeUndefined();

    const beta = world!.getEntity(betaId);
    expect(beta).toBeDefined();
    expect(beta!.locationId).toBe("white-room");
    expect(beta!.aliases.get(alphaId)).toBeUndefined();

    // Verify subjective aliases can be dynamically resolved via AliasDeltaGenerator
    const { AliasDeltaGenerator } = await import("@omnia/architect");
    const { MockLLMProvider } = await import("@omnia/llm");
    const llmProvider = new MockLLMProvider([
      { alias: "the person in the Beta jumpsuit" },
    ]);
    const aliasGenerator = new AliasDeltaGenerator(llmProvider);

    const generatedAlias = await aliasGenerator.generate(alpha!, beta!);
    expect(generatedAlias).toBe("the person in the Beta jumpsuit");
    alpha!.aliases.set(betaId, generatedAlias);
    expect(alpha!.aliases.get(betaId)).toBe("the person in the Beta jumpsuit");

    // Verify subjective world state serializes the location attributes (epistemic inclusion)
    const { serializeSubjectiveWorldState } = await import("@omnia/core");
    const subjectiveState = serializeSubjectiveWorldState(world!, alphaId);
    expect(subjectiveState).toContain("You are at location: white-room");
    expect(subjectiveState).toContain("Location attributes:");
    expect(subjectiveState).toContain(
      "description: A pristine, featureless room",
    );
    expect(subjectiveState).toContain("lighting: Bright, uniform illumination");

    // Verify objective world state serializes locations (physics awareness)
    const { serializeObjectiveWorldState } = await import("@omnia/core");
    const objectiveState = serializeObjectiveWorldState(world!);
    expect(objectiveState).toContain("Locations:");
    expect(objectiveState).toContain("- Location [ID: white-room]:");
    expect(objectiveState).toContain(
      "description: A pristine, featureless room",
    );

    // 7. Assert initial pre-seeded memories
    const alphaMemories = bufferRepo.listForOwner(alphaId);
    expect(alphaMemories).toHaveLength(1);
    expect(alphaMemories[0].id).toBe("alpha-wake");
    expect(alphaMemories[0].intent.type).toBe("monologue");
    expect(alphaMemories[0].intent.originalText).toContain("jail");
    expect(alphaMemories[0].intent.description).toBe("");

    const betaMemories = bufferRepo.listForOwner(betaId);
    expect(betaMemories).toHaveLength(1);
    expect(betaMemories[0].id).toBe("beta-wake");
    expect(betaMemories[0].intent.type).toBe("action");
    expect(betaMemories[0].intent.originalText).toContain("agreement");
    expect(betaMemories[0].intent.description).toBe("");

    db.close();
  });
});
