import { z } from "zod";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
  IEmbeddingProvider,
} from "../llm.js";

export class MockLLMProvider implements ILLMProvider {
  static readonly providerId = "mock";
  static readonly displayName = "Mock LLM Provider";
  static readonly description =
    "Stateless mock provider for testing and offline development";
  static readonly defaultModel = "mock";

  providerName = "mock";
  private callCount = 0;
  lastCalls: LLMCallRecord[] = [];

  constructor(private responses: unknown[]) {}

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const next = this.responses[this.callCount++];
    if (next === undefined) {
      return { success: false, error: "Mock responses exhausted" };
    }
    const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
    });
    try {
      const parsed = request.schema.parse(next);
      return { success: true, data: parsed, usage };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export class MockEmbeddingProvider implements IEmbeddingProvider {
  static readonly providerId = "mock";

  providerName = "mock";

  constructor(private modelName?: string) {}

  async embed(text: string): Promise<number[]> {
    // Return a deterministic mock 768-dimensional vector based on the text
    const vec = new Array(768).fill(0).map((_, i) => {
      // Return a predictable float between -1.0 and 1.0
      const charCode = text.charCodeAt(i % text.length) || 0;
      return Math.sin(charCode + i);
    });
    return vec;
  }
}
