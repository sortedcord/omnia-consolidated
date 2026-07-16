import type {
  ILLMProvider,
  IEmbeddingProvider,
  ModelProviderInstance,
  ModelProviderMeta,
} from "./llm.js";
import type { ModelInfo } from "./model-lister.js";

export interface ProviderDefinition {
  id: string;
  displayName: string;
  description: string;
  envVar?: string;
  capabilities: { generative: boolean; embedding: boolean };
  defaultModel: string;
  defaultEmbeddingModel?: string;
  defaultMaxContext: number;
  fallbackPriority: number;
  listModels?: (apiKey: string, endpointUrl?: string) => Promise<ModelInfo[]>;
  generativeCreate?: (inst: ModelProviderInstance) => ILLMProvider;
  embeddingCreate?: (inst: ModelProviderInstance) => IEmbeddingProvider;
}

const _entries = new Map<string, ProviderDefinition>();

type ProviderMeta = Omit<
  ProviderDefinition,
  "generativeCreate" | "embeddingCreate"
>;

export function registerProvider(meta: ProviderMeta) {
  const existing = _entries.get(meta.id);
  _entries.set(meta.id, {
    ...existing,
    ...meta,
    generativeCreate: existing?.generativeCreate,
    embeddingCreate: existing?.embeddingCreate,
  });
}

export function registerGenerative(
  id: string,
  createFn: (inst: ModelProviderInstance) => ILLMProvider,
) {
  const existing = _entries.get(id);
  if (existing) {
    existing.generativeCreate = createFn;
  } else {
    _entries.set(id, { id, generativeCreate: createFn } as ProviderDefinition);
  }
}

export function registerEmbedding(
  id: string,
  createFn: (inst: ModelProviderInstance) => IEmbeddingProvider,
) {
  const existing = _entries.get(id);
  if (existing) {
    existing.embeddingCreate = createFn;
  } else {
    _entries.set(id, { id, embeddingCreate: createFn } as ProviderDefinition);
  }
}

export const ProviderRegistry = {
  all: (): ProviderDefinition[] => [..._entries.values()],
  get: (id: string): ProviderDefinition | undefined => _entries.get(id),
  has: (id: string): boolean => _entries.has(id),
} as const;

export function toProviderMeta(def: ProviderDefinition): ModelProviderMeta {
  return {
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    defaultModel: def.defaultModel,
    defaultEmbeddingModel: def.defaultEmbeddingModel || "",
  };
}
