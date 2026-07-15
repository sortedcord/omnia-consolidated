export interface IntentInfo {
  type: string;
  description: string;
  selfDescription?: string;
  modifiers: string[];
  targetIds: string[];
  isValid?: boolean;
  reason?: string;
  minutesToAdvance?: number;
}

export interface LogEntry {
  turn: number;
  entityId: string;
  entityName: string;
  narrativeProse: string;
  intents: IntentInfo[];
  timestamp: string;
  rawPrompt?: {
    systemPrompt: string;
    userContext: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName?: string;
    providerInstanceName?: string;
    maxContext?: number;
  };
  decoderPrompt?: {
    systemPrompt: string;
    userContext: string;
  };
  decoderUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName?: string;
    providerInstanceName?: string;
    maxContext?: number;
  };
}

export interface EntityInfo {
  id: string;
  name: string;
  isPlayer: boolean;
  isAgent: boolean;
}

export interface WaitingContext {
  entityId: string;
  name: string;
  systemPrompt: string;
  userContext: string;
}

export interface SimSnapshot {
  id: string;
  status: "running" | "waiting_player" | "done" | "error";
  turn: number;
  maxTurns: number;
  scenarioName: string;
  scenarioDescription: string;
  entities: EntityInfo[];
  log: LogEntry[];
  entityIndex: number;
  waitingEntity?: WaitingContext;
  error?: string;
}
