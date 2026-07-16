import { z } from "zod";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
} from "../llm.js";
import { llmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";

export class AnthropicProvider implements ILLMProvider {
  static readonly providerId = "anthropic";
  static readonly displayName = "Anthropic Claude";
  static readonly description =
    "Official Claude integration using @langchain/anthropic SDK";
  static readonly defaultModel = "claude-3-5-sonnet-latest";

  providerName = "Anthropic";
  private model: ChatAnthropic;
  private modelNameUsed: string;
  private providerInstanceName?: string;
  private maxContextUsed?: number;
  lastCalls: LLMCallRecord[] = [];

  constructor(
    apiKey?: string,
    modelName?: string,
    providerInstanceName?: string,
    maxContext?: number,
  ) {
    let key = apiKey;
    let model = modelName;
    this.providerInstanceName = providerInstanceName;
    this.maxContextUsed = maxContext;

    if (!key) {
      const active = ProviderManager.getActive("generative");
      if (active && active.providerName === AnthropicProvider.providerId) {
        key = active.apiKey;
        if (!model) {
          model = active.modelName;
        }
        if (!this.providerInstanceName) {
          this.providerInstanceName = active.name;
        }
        if (this.maxContextUsed === undefined) {
          this.maxContextUsed = active.maxContext;
        }
      }
    }

    if (!key) {
      key = llmConfig.ANTHROPIC_API_KEY;
      if (!this.providerInstanceName && key) {
        this.providerInstanceName = "Environment Variable";
      }
    }

    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is required to initialize AnthropicProvider",
      );
    }

    this.modelNameUsed = model || AnthropicProvider.defaultModel;
    this.model = new ChatAnthropic({
      apiKey: key,
      model: this.modelNameUsed,
    });
  }

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const structuredModel = this.model.withStructuredOutput(request.schema, {
      includeRaw: true,
    });
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

    const usage = {
      inputTokens: raw?.usage_metadata?.input_tokens || 0,
      outputTokens: raw?.usage_metadata?.output_tokens || 0,
      totalTokens: raw?.usage_metadata?.total_tokens || 0,
      modelName: this.modelNameUsed,
      providerInstanceName: this.providerInstanceName || "Default",
      maxContext:
        this.maxContextUsed !== undefined ? this.maxContextUsed : 200000,
    };

    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
    });

    return { success: true, data: parsed, usage };
  }
}
