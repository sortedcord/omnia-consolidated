import { z } from "zod";

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
  };
}

export interface ILLMProvider {
  providerName: string;
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
}

export interface ModelProviderMeta {
  id: string;
  displayName: string;
  description: string;
  defaultModel: string;
  defaultEmbeddingModel: string;
}

export const AVAILABLE_PROVIDERS: ModelProviderMeta[] = [
  {
    id: "google-genai",
    displayName: "Google Gemini",
    description: "Official Gemini integration using Google Gen AI SDK",
    defaultModel: "gemini-2.5-flash",
    defaultEmbeddingModel: "gemini-embedding-001",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Multi-model router supporting Anthropic, OpenAI, DeepSeek, and local models",
    defaultModel: "google/gemini-2.5-flash",
    defaultEmbeddingModel: "openai/text-embedding-3-small",
  },
  {
    id: "mock",
    displayName: "Mock LLM Provider",
    description: "Stateless mock provider for testing and offline development",
    defaultModel: "mock",
    defaultEmbeddingModel: "mock-embeddings",
  },
];
