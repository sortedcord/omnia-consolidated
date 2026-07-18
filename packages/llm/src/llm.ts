import { z } from "zod";
import { ProviderRegistry } from "./registry.js";

export interface LLMRequest<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userContext: string;
  schema: T; // The Zod schema
  temperature?: number;
}

export interface LLMResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName?: string;
    providerInstanceName?: string;
    maxContext?: number;
  };
}

export interface LLMCallRecord {
  systemPrompt: string;
  userContext: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName?: string;
    providerInstanceName?: string;
    maxContext?: number;
  };
  response?: any;
}

export interface ILLMProvider {
  providerName: string;
  maxContext?: number;
  generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>>;
  lastCalls?: LLMCallRecord[];
}

export interface IEmbeddingProvider {
  providerName: string;
  embed(text: string): Promise<number[]>;
}

export interface ModelProviderInstance {
  id: string;
  name: string;
  providerName: string;
  apiKey: string;
  isActive: boolean;
  modelName?: string;
  type: "generative" | "embedding";
  maxContext?: number;
  endpointUrl?: string;
}

export interface ModelProviderMeta {
  id: string;
  displayName: string;
  description: string;
  defaultModel: string;
  defaultEmbeddingModel: string;
}

export function getAvailableProviders(): ModelProviderMeta[] {
  return ProviderRegistry.all().map((def) => ({
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    defaultModel: def.defaultModel,
    defaultEmbeddingModel: def.defaultEmbeddingModel || "",
  }));
}

export const AVAILABLE_PROVIDERS = {
  get count(): number {
    return getAvailableProviders().length;
  },
  toArray(): ModelProviderMeta[] {
    return getAvailableProviders();
  },
};
