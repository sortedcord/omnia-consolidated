import "./env"; // Must be first — loads .env before any code reads process.env
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SQLiteRepository } from "@omnia/core";
import { BufferRepository, LedgerRepository } from "@omnia/memory";
import { Architect, AliasDeltaGenerator } from "@omnia/architect";
import { ProviderManager, buildEmbeddingProvider } from "@omnia/llm";
import type { ModelProviderInstance, IEmbeddingProvider } from "@omnia/llm";
import { ScenarioLoader } from "@omnia/scenario";
import type { SimSnapshot } from "../simulation-types";
import type { SimSession, EntityInfo } from "./types";
import { resolveProviders } from "./provider-resolver";
import {
  DATA_DIR,
  loadSessionState,
  saveSession,
  listSavedSessions,
  deleteSessionFile,
} from "./session-store";
import {
  preparePlayerTurn,
  processNpcTurn,
  executePlayerAction,
} from "./turn-executor";
import { runAliasResolution, runHandoffResolution } from "./alias-handoff";

export class SimulationManager {
  private sessions = new Map<string, SimSession>();

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  async create(
    scenarioPath: string,
    playEntityName?: string,
    providerInstanceId?: string,
    customName?: string,
  ): Promise<SimSnapshot> {
    // Resolve or validate the active generative provider upfront so we can
    // return a clean error snapshot before touching the filesystem.
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

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const dbPath = path.join(DATA_DIR, `${id}.db`);
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

    // Build entity list
    const rawEntities = Array.from(worldState.entities.values());
    const entityInfos: EntityInfo[] = rawEntities.map((e) => ({
      id: e.id,
      name: (e.attributes.get("name")?.getValue() as string) || e.id,
      isPlayer: false,
      isAgent: e.isAgent,
    }));

    // Resolve player entity (exact match → name match → fuzzy)
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
        const info = entityInfos.find((e) => e.id === matched!.id);
        if (info) info.isPlayer = true;
      }
    }

    const mappings = ProviderManager.getMappings();
    const {
      actorProvider,
      validatorProvider,
      decoderProvider,
      timedeltaProvider,
      handoffProvider,
      embeddingProvider,
    } = resolveProviders(mappings, { fallbackInstance: activeInstance });

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
      worldInstanceId,
      scenarioName: customName || scenarioJson.name,
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

  async load(id: string): Promise<SimSnapshot | null> {
    const active = this.sessions.get(id);
    if (active) return this.snapshot(active);

    const dbPath = path.join(DATA_DIR, `${id}.db`);
    if (!fs.existsSync(dbPath)) return null;

    try {
      const db = new Database(dbPath);
      const state = loadSessionState(db, id);
      if (!state) {
        db.close();
        return null;
      }

      const mappings = state.providerMappings || {};
      const {
        actorProvider,
        validatorProvider,
        decoderProvider,
        timedeltaProvider,
        handoffProvider,
        embeddingProvider,
      } = resolveProviders(mappings, { required: true });

      const coreRepo = new SQLiteRepository(db);
      const bufferRepo = new BufferRepository(db);
      const ledgerRepo = new LedgerRepository(db);
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
    deleteSessionFile(id);
  }

  listSavedSessions(): SimSnapshot[] {
    return listSavedSessions(this.sessions, (s) => this.snapshot(s));
  }

  getSnapshot(id: string): SimSnapshot | null {
    const session = this.sessions.get(id);
    return session ? this.snapshot(session) : null;
  }

  async rename(id: string, newName: string): Promise<SimSnapshot | null> {
    let session = this.sessions.get(id);
    if (!session) {
      await this.load(id);
      session = this.sessions.get(id);
    }
    if (!session) return null;

    session.scenarioName = newName;
    saveSession(session);
    return this.snapshot(session);
  }

  // ---------------------------------------------------------------------------
  // Simulation stepping
  // ---------------------------------------------------------------------------

  async step(id: string): Promise<SimSnapshot | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.status !== "running") return this.snapshot(session);

    try {
      if (session.turn > session.maxTurns) {
        session.status = "done";
        saveSession(session);
        return this.snapshot(session);
      }

      // Start of turn: alias + handoff resolution before any entity acts
      if (!session.aliasDoneForTurn && session.entityIndex === 0) {
        await runAliasResolution(session);
        await runHandoffResolution(session);
        session.aliasDoneForTurn = true;
        saveSession(session);
        return this.snapshot(session);
      }

      // End of turn: advance to next turn
      if (session.entityIndex >= session.entities.length) {
        session.turn++;
        session.entityIndex = 0;
        session.aliasDoneForTurn = false;
        saveSession(session);
        return this.snapshot(session);
      }

      const info = session.entities[session.entityIndex];

      if (!info.isAgent) {
        session.entityIndex++;
        saveSession(session);
        return this.snapshot(session);
      }

      if (info.isPlayer) {
        await preparePlayerTurn(session, info);
        saveSession(session);
        return this.snapshot(session);
      }

      await processNpcTurn(session, info);
      session.entityIndex++;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
    }

    saveSession(session);
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
      await executePlayerAction(session, ctx, prose);
      session.entityIndex++;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
    }

    saveSession(session);
    return this.snapshot(session);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  async regenerateAllEmbeddings(newProviderInstanceId?: string): Promise<void> {
    if (!fs.existsSync(DATA_DIR)) return;

    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith("sim-") && f.endsWith(".db"));

    const list = ProviderManager.list();
    let inst = newProviderInstanceId
      ? (list.find((p) => p.id === newProviderInstanceId) ?? null)
      : null;
    if (!inst || inst.type !== "embedding") {
      inst = ProviderManager.getActive("embedding");
    }

    if (!inst) {
      const envKey = process.env.GOOGLE_API_KEY || "";
      if (envKey) {
        inst = {
          id: "regen-env-fallback",
          name: "Gemini Embed (Env)",
          providerName: "google-genai",
          apiKey: envKey,
          isActive: true,
          modelName: "gemini-embedding-001",
          type: "embedding",
          maxContext: 0,
        };
      } else {
        inst = {
          id: "regen-mock-fallback",
          name: "Mock Embed (Fallback)",
          providerName: "mock",
          apiKey: "",
          isActive: true,
          modelName: undefined,
          type: "embedding",
          maxContext: 0,
        };
      }
    }

    const embeddingProvider: IEmbeddingProvider = buildEmbeddingProvider(inst);

    for (const file of files) {
      const dbPath = path.join(DATA_DIR, file);
      const fileId = file.replace(".db", "");
      const activeSession = this.sessions.get(fileId);
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
        if (!activeSession) db.close();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

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
