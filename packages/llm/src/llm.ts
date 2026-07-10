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
  };
}

export interface LLMCallRecord {
  systemPrompt: string;
  userContext: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ILLMProvider {
  providerName: string;
  // We use Zod to ensure the generic T matches the schema
  generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>>;
  lastCalls?: LLMCallRecord[];
}

export interface LLMProviderInstance {
  id: string;
  name: string;
  providerName: string;
  apiKey: string;
  isActive: boolean;
  modelName?: string;
}

export interface LLMProviderMeta {
  id: string;
  displayName: string;
  description: string;
  defaultModel: string;
}

export const AVAILABLE_PROVIDERS: LLMProviderMeta[] = [
  {
    id: "google-genai",
    displayName: "Google Gemini",
    description: "Official Gemini integration using Google Gen AI SDK",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Multi-model router supporting Anthropic, OpenAI, DeepSeek, and local models",
    defaultModel: "google/gemini-2.5-flash",
  },
  {
    id: "mock",
    displayName: "Mock LLM Provider",
    description: "Stateless mock provider for testing and offline development",
    defaultModel: "mock",
  },
];
