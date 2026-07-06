import { z } from "zod";
import { ILLMProvider, LLMRequest, LLMResponse } from "../llm.js";

export class MockLLMProvider implements ILLMProvider {
  providerName = "mock";
  private callCount = 0;

  constructor(private responses: unknown[]) {}

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const next = this.responses[this.callCount++];
    if (next === undefined) {
      return { success: false, error: "Mock responses exhausted" };
    }
    try {
      const parsed = request.schema.parse(next);
      return { success: true, data: parsed };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
