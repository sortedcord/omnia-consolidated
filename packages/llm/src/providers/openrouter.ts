import { z } from "zod";
import { ChatOpenRouter } from "@langchain/openrouter";
import { ILLMProvider, LLMRequest, LLMResponse, LLMCallRecord } from "../llm.js";
import { llmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";

export class OpenRouterProvider implements ILLMProvider {
  providerName = "OpenRouter";
  private model: ChatOpenRouter;
  lastCalls: LLMCallRecord[] = [];

  constructor(apiKey?: string, modelName?: string) {
    let key = apiKey;
    let model = modelName;

    if (!key) {
      const active = ProviderManager.getActive();
      if (active) {
        key = active.apiKey;
        if (!model) {
          model = active.modelName;
        }
      }
    }

    if (!key) {
      key = llmConfig.OPENROUTER_API_KEY;
    }

    if (!key) {
      throw new Error("OPENROUTER_API_KEY is required to initialize OpenRouterProvider");
    }

    this.model = new ChatOpenRouter({
      apiKey: key,
      model: model || "google/gemini-2.5-flash",
    });
  }

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const structuredModel = this.model.withStructuredOutput(request.schema, { includeRaw: true });
    const result = (await structuredModel.invoke([
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userContext },
    ])) as unknown as {
      parsed?: z.infer<T>;
      raw?: {
        usage_metadata?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        };
      };
    };

    const parsed = result?.parsed;
    const raw = result?.raw;

    const usage = raw?.usage_metadata ? {
      inputTokens: raw.usage_metadata.input_tokens || 0,
      outputTokens: raw.usage_metadata.output_tokens || 0,
      totalTokens: raw.usage_metadata.total_tokens || 0,
    } : undefined;

    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
    });

    return { success: true, data: parsed, usage };
  }
}
