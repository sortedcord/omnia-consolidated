import { z } from "zod";
import { ILLMProvider, LLMRequest, LLMResponse, LLMCallRecord } from "../llm.js";

export class MockLLMProvider implements ILLMProvider {
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
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
