import dotenv from "dotenv";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SQLiteRepository } from "@omnia/core";

// Load .env from monorepo root or apps/gui/
const cwd = process.cwd();
const envCandidates = [
  path.resolve(cwd, ".env"),
  path.resolve(cwd, "../../.env"),
];
for (const c of envCandidates) {
  if (fs.existsSync(c) && fs.statSync(c).isFile()) {
    dotenv.config({ path: c });
    break;
  }
}

import {
  BufferRepository,
  LedgerRepository,
  HandoffEngine,
  checkHandoffTrigger,
} from "@omnia/memory";
import { Architect, AliasDeltaGenerator } from "@omnia/architect";
import {
  ActorAgent,
  ActorPromptBuilder,
  IActorProseGenerator,
  buildBufferEntryForIntent,
} from "@omnia/actor";
import {
  GeminiProvider,
  ILLMProvider,
  MockLLMProvider,
  ProviderManager,
  OpenRouterProvider,
  IEmbeddingProvider,
  GeminiEmbeddingProvider,
  MockEmbeddingProvider,
  ModelProviderInstance,
} from "@omnia/llm";
import { ScenarioLoader } from "@omnia/scenario";

import type {
  IntentInfo,
  LogEntry,
  EntityInfo,
  WaitingContext,
  SimSnapshot,
} from "./simulation-types.js";

export type { SimSnapshot, EntityInfo, LogEntry, IntentInfo, WaitingContext };

class FixedProseGenerator implements IActorProseGenerator {
  constructor(private prose: string) {}

  async generate(
    entityId: string,
    systemPrompt: string,
    userContext: string,
  ): Promise<string> {
    void entityId;
    void systemPrompt;
    void userContext;
    return this.prose;
  }
}

interface SavedState {
  scenarioName: string;
  scenarioDescription: string;
  turn: number;
  maxTurns: number;
  entities: EntityInfo[];
  playerEntityId: string | undefined;
  entityIndex: number;
  status: "running" | "waiting_player" | "done" | "error";
  error?: string;
  waitingEntity?: WaitingContext;
  aliasDoneForTurn: boolean;
  log: LogEntry[];
  providerMappings: Record<string, string>;
}

function loadSessionState(
  db: Database.Database,
  id: string,
): SavedState | null {
  try {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS gui_meta (
        id TEXT PRIMARY KEY,
        state_json TEXT
      )
    `,
    ).run();
    const row = db
      .prepare(`SELECT state_json FROM gui_meta WHERE id = ?`)
      .get(id) as { state_json: string } | undefined;
    return row ? (JSON.parse(row.state_json) as SavedState) : null;
  } catch {
    return null;
  }
}

interface SimSession {
  db: Database.Database;
  dbPath: string;
  coreRepo: SQLiteRepository;
  bufferRepo: BufferRepository;
  ledgerRepo: LedgerRepository;
  worldInstanceId: string;
  scenarioName: string;
  scenarioDescription: string;
  turn: number;
  maxTurns: number;
  entities: EntityInfo[];
  playerEntityId: string | undefined;
  entityIndex: number;
  actorProvider: ILLMProvider;
  validatorProvider: ILLMProvider;
  decoderProvider: ILLMProvider;
  timedeltaProvider: ILLMProvider;
  handoffProvider: ILLMProvider;
  embeddingProvider: IEmbeddingProvider;
  architect: Architect;
  aliasGenerator: AliasDeltaGenerator;
  log: LogEntry[];
  status: "running" | "waiting_player" | "done" | "error";
  error?: string;
  waitingEntity?: WaitingContext;
  aliasDoneForTurn: boolean;
  providerMappings: Record<string, string>;
}

class SimulationManager {
  private sessions = new Map<string, SimSession>();

  async create(
    scenarioPath: string,
    playEntityName?: string,
    providerInstanceId?: string,
  ): Promise<SimSnapshot> {
    let activeInstance: ModelProviderInstance | null = providerInstanceId
      ? ProviderManager.list().find((p) => p.id === providerInstanceId) || null
      : ProviderManager.getActive("generative");

    if (!activeInstance) {
      const envKey = process.env.GOOGLE_API_KEY;
      if (envKey) {
        activeInstance = ProviderManager.create(
          "Default (Env)",
          "google-genai",
          envKey,
          undefined,
          "generative",
        );
      }
    }
    if (!activeInstance) {
      return {
        id: "",
        status: "error",
        turn: 0,
        maxTurns: 20,
        scenarioName: "",
        scenarioDescription: "",
        entities: [],
        log: [],
        entityIndex: 0,
        error:
          "No active LLM Provider Instance found. Please configure a key in Settings first.",
      };
    }

    const scenarioJson = JSON.parse(fs.readFileSync(scenarioPath, "utf-8"));
    const id = `sim-${Date.now()}`;

    const dbDir = path.resolve(process.cwd(), "data");
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, `${id}.db`);
    const db = new Database(dbPath);
    const coreRepo = new SQLiteRepository(db);
    const bufferRepo = new BufferRepository(db);
    const ledgerRepo = new LedgerRepository(db);
    const loader = new ScenarioLoader(coreRepo, bufferRepo);

    const worldInstanceId = id;
    await loader.initializeWorld(scenarioJson, worldInstanceId);

    const worldState = coreRepo.loadWorldState(worldInstanceId);
    if (!worldState) {
      db.close();
      return {
        id: "",
        status: "error",
        turn: 0,
        maxTurns: 20,
        scenarioName: "",
        scenarioDescription: "",
        entities: [],
        log: [],
        entityIndex: 0,
        error: "Failed to load world state after initialization.",
      };
    }

    const rawEntities = Array.from(worldState.entities.values());
    const entityInfos: EntityInfo[] = rawEntities.map((e) => ({
      id: e.id,
      name: (e.attributes.get("name")?.getValue() as string) || e.id,
      isPlayer: false,
      isAgent: e.isAgent,
    }));

    let playerEntityId: string | undefined;
    if (playEntityName) {
      let matched = worldState.getEntity(playEntityName);
      if (!matched) {
        for (const ent of rawEntities) {
          const nameAttr = ent.attributes.get("name")?.getValue() as
            string | undefined;
          if (nameAttr?.toLowerCase() === playEntityName.toLowerCase()) {
            matched = ent;
            break;
          }
        }
      }
      if (!matched) {
        for (const ent of rawEntities) {
          const nameAttr = ent.attributes.get("name")?.getValue() as
            string | undefined;
          if (
            nameAttr?.toLowerCase().includes(playEntityName.toLowerCase()) ||
            ent.id.toLowerCase().includes(playEntityName.toLowerCase())
          ) {
            matched = ent;
            break;
          }
        }
      }
      if (matched) {
        playerEntityId = matched.id;
        const info = entityInfos.find((e) => e.id === matched.id);
        if (info) info.isPlayer = true;
      }
    }

    const list = ProviderManager.list();
    const active = ProviderManager.getActive("generative") || activeInstance;
    const mappings = ProviderManager.getMappings();

    const resolveProviderForTask = (task: string): ILLMProvider => {
      const mappedId = mappings[task];
      let inst = mappedId ? list.find((p) => p.id === mappedId) : null;
      if (!inst || inst.type !== "generative") {
        inst = active;
      }

      const key = inst ? inst.apiKey : process.env.GOOGLE_API_KEY || "";
      const providerName = inst ? inst.providerName : "google-genai";
      const modelName = inst ? inst.modelName : undefined;
      const instanceName = inst ? inst.name : undefined;
      const maxContext = inst ? inst.maxContext : undefined;

      if (providerName === "google-genai") {
        return new GeminiProvider(key, modelName, instanceName, maxContext);
      } else if (providerName === "openrouter") {
        return new OpenRouterProvider(key, modelName, instanceName, maxContext);
      } else {
        return new MockLLMProvider([]);
      }
    };

    const resolveEmbeddingProvider = (): IEmbeddingProvider => {
      const mappedId = mappings["embeddings"];
      let inst = mappedId ? list.find((p) => p.id === mappedId) : null;
      if (!inst || inst.type !== "embedding") {
        inst = ProviderManager.getActive("embedding");
      }

      const key = inst ? inst.apiKey : process.env.GOOGLE_API_KEY || "";
      const providerName = inst ? inst.providerName : "google-genai";
      const modelName = inst ? inst.modelName : undefined;

      if (providerName === "google-genai") {
        return new GeminiEmbeddingProvider(key, modelName);
      } else {
        return new MockEmbeddingProvider(modelName);
      }
    };

    const actorProvider = resolveProviderForTask("actor-prose");
    const validatorProvider = resolveProviderForTask("llm-validator");
    const decoderProvider = resolveProviderForTask("intent-decoder");
    const timedeltaProvider = resolveProviderForTask("timedelta");
    const handoffProvider = resolveProviderForTask("handoff");
    const embeddingProvider = resolveEmbeddingProvider();

    const architect = new Architect(
      { validator: validatorProvider, timedelta: timedeltaProvider },
      coreRepo,
    );
    const aliasGenerator = new AliasDeltaGenerator(actorProvider);

    const session: SimSession = {
      db,
      dbPath,
      coreRepo,
      bufferRepo,
      ledgerRepo,
      worldInstanceId: worldInstanceId,
      scenarioName: scenarioJson.name,
      scenarioDescription: scenarioJson.description || "",
      turn: 1,
      maxTurns: 20,
      entities: entityInfos,
      playerEntityId,
      entityIndex: 0,
      actorProvider,
      validatorProvider,
      decoderProvider,
      timedeltaProvider,
      handoffProvider,
      embeddingProvider,
      architect,
      aliasGenerator,
      log: [],
      status: "running",
      aliasDoneForTurn: false,
      providerMappings: mappings,
    };

    this.sessions.set(id, session);
    return this.snapshot(session);
  }

  async step(id: string): Promise<SimSnapshot | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.status !== "running") return this.snapshot(session);

    try {
      if (session.turn > session.maxTurns) {
        session.status = "done";
        this.save(session);
        return this.snapshot(session);
      }

      if (!session.aliasDoneForTurn && session.entityIndex === 0) {
        await this.runAliasResolution(session);
        await this.runHandoffResolution(session);
        session.aliasDoneForTurn = true;
        this.save(session);
        return this.snapshot(session);
      }

      if (session.entityIndex >= session.entities.length) {
        session.turn++;
        session.entityIndex = 0;
        session.aliasDoneForTurn = false;
        this.save(session);
        return this.snapshot(session);
      }

      const info = session.entities[session.entityIndex];

      if (!info.isAgent) {
        session.entityIndex++;
        this.save(session);
        return this.snapshot(session);
      }

      if (info.isPlayer) {
        await this.preparePlayerTurn(session, info);
        this.save(session);
        return this.snapshot(session);
      }

      await this.processNpcTurn(session, info);
      session.entityIndex++;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
    }

    this.save(session);
    return this.snapshot(session);
  }

  async submitPlayerAction(
    id: string,
    prose: string,
  ): Promise<SimSnapshot | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.status !== "waiting_player") return this.snapshot(session);
    if (!session.waitingEntity) return this.snapshot(session);

    const ctx = session.waitingEntity;
    session.waitingEntity = undefined;
    session.status = "running";

    try {
      const worldState = session.coreRepo.loadWorldState(
        session.worldInstanceId,
      );
      if (!worldState) throw new Error("World state lost");

      const entity = worldState.getEntity(ctx.entityId);
      if (!entity) throw new Error(`Player entity "${ctx.entityId}" not found`);

      const playerActor = new ActorAgent(
        { actor: session.actorProvider, decoder: session.decoderProvider },
        session.bufferRepo,
        session.ledgerRepo,
        20,
        new FixedProseGenerator(prose),
      );

      const result = await playerActor.act(worldState, entity);

      const entry: LogEntry = {
        turn: session.turn,
        entityId: ctx.entityId,
        entityName: ctx.name,
        narrativeProse: result.narrativeProse,
        intents: [],
        timestamp: worldState.clock.get().toISOString(),
        rawPrompt: {
          systemPrompt: ctx.systemPrompt,
          userContext: ctx.userContext,
        },
      };

      if (
        session.decoderProvider.lastCalls &&
        session.decoderProvider.lastCalls.length > 0
      ) {
        const call =
          session.decoderProvider.lastCalls[
            session.decoderProvider.lastCalls.length - 1
          ];
        entry.decoderPrompt = {
          systemPrompt: call.systemPrompt,
          userContext: call.userContext,
        };
        entry.decoderUsage = call.usage;
      }

      for (const intent of result.intents.intents) {
        const outcome = await session.architect.processIntent(
          worldState,
          intent,
        );
        const ts = worldState.clock.get().toISOString();

        entry.intents.push({
          type: intent.type,
          description: intent.description,
          selfDescription: intent.selfDescription,
          modifiers: intent.modifiers || [],
          targetIds: intent.targetIds,
          isValid: outcome.isValid,
          reason: outcome.reason,
          minutesToAdvance: outcome.timeDelta?.minutesToAdvance,
        });

        const actorEntry = buildBufferEntryForIntent(
          intent,
          ts,
          entity.locationId,
        );
        if (intent.type === "action") {
          actorEntry.outcome = {
            isValid: outcome.isValid,
            reason: outcome.reason,
          };
        }
        session.bufferRepo.save(actorEntry);

        if (
          entity.locationId &&
          (intent.type === "dialogue" || intent.type === "action")
        ) {
          for (const [, other] of worldState.entities) {
            if (
              other.id !== ctx.entityId &&
              other.locationId === entity.locationId
            ) {
              const observerEntry = buildBufferEntryForIntent(
                intent,
                ts,
                entity.locationId,
              );
              if (intent.type === "action") {
                observerEntry.outcome = {
                  isValid: outcome.isValid,
                  reason: outcome.reason,
                };
              }
              session.bufferRepo.save({
                ...observerEntry,
                ownerId: other.id,
              });
            }
          }
        }
      }

      session.log.push(entry);
      session.coreRepo.saveWorldState(worldState);
      session.entityIndex++;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
    }

    this.save(session);
    return this.snapshot(session);
  }

  private async preparePlayerTurn(
    session: SimSession,
    info: EntityInfo,
  ): Promise<void> {
    const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
    if (!worldState) throw new Error("World state lost");

    const entity = worldState.getEntity(info.id);
    if (!entity) throw new Error(`Entity "${info.id}" not found`);

    const promptBuilder = new ActorPromptBuilder(
      session.bufferRepo,
      session.ledgerRepo,
      20,
    );
    const { systemPrompt, userContext } = promptBuilder.build(
      worldState,
      entity,
    );

    session.waitingEntity = {
      entityId: info.id,
      name: info.name,
      systemPrompt,
      userContext,
    };
    session.status = "waiting_player";
  }

  private async processNpcTurn(
    session: SimSession,
    info: EntityInfo,
  ): Promise<void> {
    const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
    if (!worldState) throw new Error("World state lost");

    const entity = worldState.getEntity(info.id);
    if (!entity) throw new Error(`Entity "${info.id}" not found`);

    const actor = new ActorAgent(
      { actor: session.actorProvider, decoder: session.decoderProvider },
      session.bufferRepo,
      session.ledgerRepo,
      20,
    );
    const result = await actor.act(worldState, entity);

    const entry: LogEntry = {
      turn: session.turn,
      entityId: info.id,
      entityName: info.name,
      narrativeProse: result.narrativeProse,
      intents: [],
      timestamp: worldState.clock.get().toISOString(),
    };

    if (
      session.actorProvider.lastCalls &&
      session.actorProvider.lastCalls.length > 0
    ) {
      const actorCall =
        session.actorProvider.lastCalls[
          session.actorProvider.lastCalls.length - 1
        ];
      entry.rawPrompt = {
        systemPrompt: actorCall.systemPrompt,
        userContext: actorCall.userContext,
      };
      entry.usage = actorCall.usage;
    }

    if (
      session.decoderProvider.lastCalls &&
      session.decoderProvider.lastCalls.length > 0
    ) {
      const decoderCall =
        session.decoderProvider.lastCalls[
          session.decoderProvider.lastCalls.length - 1
        ];
      entry.decoderPrompt = {
        systemPrompt: decoderCall.systemPrompt,
        userContext: decoderCall.userContext,
      };
      entry.decoderUsage = decoderCall.usage;
    }

    for (const intent of result.intents.intents) {
      const outcome = await session.architect.processIntent(worldState, intent);
      const ts = worldState.clock.get().toISOString();

      entry.intents.push({
        type: intent.type,
        description: intent.description,
        selfDescription: intent.selfDescription,
        modifiers: intent.modifiers || [],
        targetIds: intent.targetIds,
        isValid: outcome.isValid,
        reason: outcome.reason,
        minutesToAdvance: outcome.timeDelta?.minutesToAdvance,
      });

      const actorEntry = buildBufferEntryForIntent(
        intent,
        ts,
        entity.locationId,
      );
      if (intent.type === "action") {
        actorEntry.outcome = {
          isValid: outcome.isValid,
          reason: outcome.reason,
        };
      }
      session.bufferRepo.save(actorEntry);

      if (
        entity.locationId &&
        (intent.type === "dialogue" || intent.type === "action")
      ) {
        for (const [, other] of worldState.entities) {
          if (other.id !== info.id && other.locationId === entity.locationId) {
            const observerEntry = buildBufferEntryForIntent(
              intent,
              ts,
              entity.locationId,
            );
            if (intent.type === "action") {
              observerEntry.outcome = {
                isValid: outcome.isValid,
                reason: outcome.reason,
              };
            }
            session.bufferRepo.save({ ...observerEntry, ownerId: other.id });
          }
        }
      }
    }

    session.log.push(entry);
    session.coreRepo.saveWorldState(worldState);
  }

  private async runHandoffResolution(session: SimSession): Promise<void> {
    const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
    if (!worldState) throw new Error("World state lost");

    const handoffEngine = new HandoffEngine(
      session.handoffProvider,
      session.embeddingProvider,
      session.bufferRepo,
      session.ledgerRepo,
    );

    const entities = Array.from(worldState.entities.values());
    for (const entity of entities) {
      if (!entity.isAgent) continue;
      const bufferEntries = session.bufferRepo.listForOwner(entity.id);
      const maxContext =
        session.handoffProvider.maxContext !== undefined
          ? session.handoffProvider.maxContext
          : 32768;

      const trigger = checkHandoffTrigger(
        entity,
        bufferEntries,
        worldState.clock.get(),
        maxContext,
      );
      if (trigger !== "none") {
        await handoffEngine.runHandoff(
          entity,
          bufferEntries,
          worldState.clock.get(),
        );
      }
    }
  }

  private async runAliasResolution(session: SimSession): Promise<void> {
    const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
    if (!worldState) throw new Error("World state lost");

    const entities = Array.from(worldState.entities.values());
    for (const viewer of entities) {
      if (!viewer.isAgent) continue;
      if (!viewer.locationId) continue;
      for (const target of entities) {
        if (viewer.id === target.id) continue;
        if (
          target.locationId === viewer.locationId &&
          !viewer.aliases.has(target.id)
        ) {
          const alias = await session.aliasGenerator.generate(viewer, target);
          viewer.aliases.set(target.id, alias);
          session.coreRepo.saveEntity(viewer, worldState.id);
        }
      }
    }
  }

  close(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.db.close();
      this.sessions.delete(id);
    }
  }

  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.db.close();
      this.sessions.delete(id);
    }
    const dbDir = path.resolve(process.cwd(), "data");
    const dbPath = path.join(dbDir, `${id}.db`);
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (err) {
        console.error(`Failed to delete session file ${dbPath}:`, err);
      }
    }
  }

  async load(id: string): Promise<SimSnapshot | null> {
    const active = this.sessions.get(id);
    if (active) {
      return this.snapshot(active);
    }

    const dbDir = path.resolve(process.cwd(), "data");
    const dbPath = path.join(dbDir, `${id}.db`);
    if (!fs.existsSync(dbPath)) return null;

    try {
      const db = new Database(dbPath);
      const state = loadSessionState(db, id);
      if (!state) {
        db.close();
        return null;
      }

      const list = ProviderManager.list();
      const active = ProviderManager.getActive("generative");
      const mappings = state.providerMappings || {};

      const resolveProviderForTask = (task: string): ILLMProvider => {
        const mappedId = mappings[task];
        let inst = mappedId ? list.find((p) => p.id === mappedId) : null;
        if (!inst || inst.type !== "generative") {
          inst = active;
        }

        if (!inst) {
          const envKey = process.env.GOOGLE_API_KEY;
          if (envKey) {
            inst = ProviderManager.create(
              "Default (Env)",
              "google-genai",
              envKey,
              undefined,
              "generative",
            );
          }
        }

        if (!inst) {
          throw new Error(
            `No active LLM Provider Instance found for task "${task}". Please configure a key in Settings first.`,
          );
        }

        if (inst.providerName === "google-genai") {
          return new GeminiProvider(
            inst.apiKey,
            inst.modelName,
            inst.name,
            inst.maxContext,
          );
        } else if (inst.providerName === "openrouter") {
          return new OpenRouterProvider(
            inst.apiKey,
            inst.modelName,
            inst.name,
            inst.maxContext,
          );
        } else {
          return new MockLLMProvider([]);
        }
      };

      const resolveEmbeddingProvider = (): IEmbeddingProvider => {
        const mappedId = mappings["embeddings"];
        let inst = mappedId ? list.find((p) => p.id === mappedId) : null;
        if (!inst || inst.type !== "embedding") {
          inst = ProviderManager.getActive("embedding");
        }
        if (!inst) {
          const envKey = process.env.GOOGLE_API_KEY;
          if (envKey) {
            inst = ProviderManager.create(
              "Default Embed (Env)",
              "google-genai",
              envKey,
              "gemini-embedding-001",
              "embedding",
            );
          }
        }

        if (!inst) {
          throw new Error(
            `No active Embedding Provider Instance found for task "embeddings". Please configure an embedding key in Settings first.`,
          );
        }

        if (inst.providerName === "google-genai") {
          return new GeminiEmbeddingProvider(inst.apiKey, inst.modelName);
        } else {
          return new MockEmbeddingProvider(inst.modelName);
        }
      };

      const coreRepo = new SQLiteRepository(db);
      const bufferRepo = new BufferRepository(db);
      const ledgerRepo = new LedgerRepository(db);

      const actorProvider = resolveProviderForTask("actor-prose");
      const validatorProvider = resolveProviderForTask("llm-validator");
      const decoderProvider = resolveProviderForTask("intent-decoder");
      const timedeltaProvider = resolveProviderForTask("timedelta");
      const handoffProvider = resolveProviderForTask("handoff");
      const embeddingProvider = resolveEmbeddingProvider();

      const architect = new Architect(
        { validator: validatorProvider, timedelta: timedeltaProvider },
        coreRepo,
      );
      const aliasGenerator = new AliasDeltaGenerator(actorProvider);

      const session: SimSession = {
        db,
        dbPath,
        coreRepo,
        bufferRepo,
        ledgerRepo,
        worldInstanceId: id,
        scenarioName: state.scenarioName,
        scenarioDescription: state.scenarioDescription,
        turn: state.turn,
        maxTurns: state.maxTurns,
        entities: state.entities || [],
        playerEntityId: state.playerEntityId,
        entityIndex: state.entityIndex,
        actorProvider,
        validatorProvider,
        decoderProvider,
        timedeltaProvider,
        handoffProvider,
        embeddingProvider,
        architect,
        aliasGenerator,
        log: state.log || [],
        status: state.status,
        error: state.error,
        waitingEntity: state.waitingEntity,
        aliasDoneForTurn: state.aliasDoneForTurn || false,
        providerMappings: mappings,
      };

      this.sessions.set(id, session);
      return this.snapshot(session);
    } catch (err) {
      console.error(`Failed to load session ${id}:`, err);
      return null;
    }
  }

  listSavedSessions(): SimSnapshot[] {
    const dbDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) return [];

    const snapshots: SimSnapshot[] = [];
    const files = fs
      .readdirSync(dbDir)
      .filter((f) => f.startsWith("sim-") && f.endsWith(".db"));

    for (const file of files) {
      const id = file.replace(".db", "");
      const dbPath = path.join(dbDir, file);

      const active = this.sessions.get(id);
      if (active) {
        snapshots.push(this.snapshot(active));
        continue;
      }

      try {
        const db = new Database(dbPath);
        const state = loadSessionState(db, id);
        db.close();

        if (state) {
          snapshots.push({
            id,
            status: state.status,
            turn: state.turn,
            maxTurns: state.maxTurns,
            scenarioName: state.scenarioName,
            scenarioDescription: state.scenarioDescription,
            entities: state.entities || [],
            log: state.log || [],
            entityIndex: state.entityIndex,
            waitingEntity: state.waitingEntity,
            error: state.error,
          });
        }
      } catch {
        /* skip */
      }
    }

    return snapshots.sort((a, b) => {
      const tsA = parseInt(a.id.replace("sim-", ""), 10) || 0;
      const tsB = parseInt(b.id.replace("sim-", ""), 10) || 0;
      return tsB - tsA;
    });
  }

  async regenerateAllEmbeddings(newProviderInstanceId?: string): Promise<void> {
    const dbDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) return;

    const files = fs
      .readdirSync(dbDir)
      .filter((f) => f.startsWith("sim-") && f.endsWith(".db"));

    const list = ProviderManager.list();
    let inst = newProviderInstanceId
      ? list.find((p) => p.id === newProviderInstanceId)
      : null;
    if (!inst || inst.type !== "embedding") {
      inst = ProviderManager.getActive("embedding");
    }

    const key = inst ? inst.apiKey : process.env.GOOGLE_API_KEY || "";
    const providerName = inst ? inst.providerName : "google-genai";
    const modelName = inst ? inst.modelName : undefined;

    let embeddingProvider: IEmbeddingProvider;
    if (providerName === "google-genai") {
      embeddingProvider = new GeminiEmbeddingProvider(key, modelName);
    } else {
      embeddingProvider = new MockEmbeddingProvider(modelName);
    }

    for (const file of files) {
      const dbPath = path.join(dbDir, file);
      const id = file.replace(".db", "");
      const activeSession = this.sessions.get(id);
      const db = activeSession ? activeSession.db : new Database(dbPath);

      try {
        const rows = db
          .prepare(`SELECT id, content FROM ledger_entries`)
          .all() as { id: string; content: string }[];

        for (const row of rows) {
          const vector = await embeddingProvider.embed(row.content);
          const buffer = Buffer.from(new Float32Array(vector).buffer);
          db.prepare(
            `UPDATE ledger_entries SET embedding = ? WHERE id = ?`,
          ).run(buffer, row.id);
        }
      } catch (err) {
        console.error(`Failed to regenerate embeddings for ${file}:`, err);
      } finally {
        if (!activeSession) {
          db.close();
        }
      }
    }
  }

  private save(session: SimSession): void {
    const state: SavedState = {
      scenarioName: session.scenarioName,
      scenarioDescription: session.scenarioDescription,
      turn: session.turn,
      maxTurns: session.maxTurns,
      entities: session.entities,
      playerEntityId: session.playerEntityId,
      entityIndex: session.entityIndex,
      status: session.status,
      error: session.error,
      waitingEntity: session.waitingEntity,
      aliasDoneForTurn: session.aliasDoneForTurn,
      log: session.log,
      providerMappings: session.providerMappings,
    };

    session.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS gui_meta (
        id TEXT PRIMARY KEY,
        state_json TEXT
      )
    `,
      )
      .run();

    session.db
      .prepare(
        `
      INSERT INTO gui_meta (id, state_json)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json
    `,
      )
      .run(session.worldInstanceId, JSON.stringify(state));
  }

  getSnapshot(id: string): SimSnapshot | null {
    const session = this.sessions.get(id);
    return session ? this.snapshot(session) : null;
  }

  private snapshot(session: SimSession): SimSnapshot {
    return {
      id: session.worldInstanceId,
      status: session.status,
      turn: session.turn,
      maxTurns: session.maxTurns,
      scenarioName: session.scenarioName,
      scenarioDescription: session.scenarioDescription,
      entities: session.entities,
      log: session.log,
      entityIndex: session.entityIndex,
      waitingEntity: session.waitingEntity,
      error: session.error,
    };
  }
}

export const simulationManager = new SimulationManager();
