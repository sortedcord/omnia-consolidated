import type Database from "better-sqlite3";
import type { SQLiteRepository } from "@omnia/core";
import type { BufferRepository, LedgerRepository } from "@omnia/memory";
import type { Architect, AliasDeltaGenerator } from "@omnia/architect";
import type { ILLMProvider, IEmbeddingProvider } from "@omnia/llm";
import type { EntityInfo, LogEntry, WaitingContext } from "../simulation-types";

export type {
  EntityInfo,
  IntentInfo,
  LogEntry,
  SimSnapshot,
  WaitingContext,
} from "../simulation-types";

// ---------------------------------------------------------------------------
// Persisted state (written to sqlite gui_meta table as JSON)
// ---------------------------------------------------------------------------

export interface SavedState {
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

// ---------------------------------------------------------------------------
// In-memory session (held in SimulationManager.sessions Map)
// ---------------------------------------------------------------------------

export interface SimSession {
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
