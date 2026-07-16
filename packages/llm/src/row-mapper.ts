import type { ModelProviderInstance } from "./llm.js";

export type DbRow = {
  id: string;
  name: string;
  providerName: string;
  apiKey: string;
  isActive: number;
  modelName?: string;
  type: string;
  maxContext?: number;
  endpointUrl?: string;
};

export function mapRow(r: DbRow): ModelProviderInstance {
  return {
    id: r.id,
    name: r.name,
    providerName: r.providerName,
    apiKey: r.apiKey,
    isActive: r.isActive === 1,
    modelName: r.modelName || undefined,
    type: (r.type as "generative" | "embedding") || "generative",
    maxContext:
      r.maxContext !== undefined && r.maxContext !== null
        ? r.maxContext
        : r.type === "embedding"
          ? 0
          : 32768,
    endpointUrl: r.endpointUrl || undefined,
  };
}
