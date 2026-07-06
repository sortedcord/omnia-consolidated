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
}

export interface ILLMProvider {
  providerName: string;
  // We use Zod to ensure the generic T matches the schema
  generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>>;
}
