import { z } from "zod";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
  IEmbeddingProvider,
} from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import {
  registerProvider,
  registerGenerative,
  registerEmbedding,
} from "../registry.js";

export class MockLLMProvider implements ILLMProvider {
  static {
    registerProvider({
      id: "mock",
      displayName: "Mock LLM Provider",
      description:
        "Stateless mock provider for testing and offline development",
      capabilities: { generative: true, embedding: true },
      defaultModel: "mock",
      defaultEmbeddingModel: "mock-embeddings",
      defaultMaxContext: 0,
      fallbackPriority: 1000,
      listModels: () => Promise.resolve([{ id: "mock", name: "Mock Model" }]),
    });
    registerGenerative("mock", () => new MockLLMProvider([]));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static create(inst: ModelProviderInstance): ILLMProvider {
    return new MockLLMProvider([]);
  }

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
    try {
      const parsed = request.schema.parse(next);
      this.lastCalls.push({
        systemPrompt: request.systemPrompt,
        userContext: request.userContext,
        usage,
        response: parsed,
      });
      return { success: true, data: parsed, usage };
    } catch (e) {
      this.lastCalls.push({
        systemPrompt: request.systemPrompt,
        userContext: request.userContext,
        usage,
      });
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export class MockEmbeddingProvider implements IEmbeddingProvider {
  static {
    registerEmbedding(
      "mock",
      (inst: ModelProviderInstance) =>
        new MockEmbeddingProvider(inst.modelName),
    );
  }

  static create(inst: ModelProviderInstance): IEmbeddingProvider {
    return new MockEmbeddingProvider(inst.modelName);
  }

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
