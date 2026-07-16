import { z } from "zod";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
  IEmbeddingProvider,
} from "../llm.js";
import { llmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";

export class OpenAIProvider implements ILLMProvider {
  static readonly providerId = "openai";
  static readonly displayName = "OpenAI";
  static readonly description =
    "Official OpenAI integration using @langchain/openai SDK";
  static readonly defaultModel = "gpt-4o-mini";

  providerName = "OpenAI";
  private model: ChatOpenAI;
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
      if (active && active.providerName === OpenAIProvider.providerId) {
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
      key = llmConfig.OPENAI_API_KEY;
      if (!this.providerInstanceName && key) {
        this.providerInstanceName = "Environment Variable";
      }
    }

    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is required to initialize OpenAIProvider",
      );
    }

    this.modelNameUsed = model || OpenAIProvider.defaultModel;
    this.model = new ChatOpenAI({
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
        this.maxContextUsed !== undefined ? this.maxContextUsed : 128000,
    };

    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
    });

    return { success: true, data: parsed, usage };
  }
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  static readonly providerId = "openai";
  static readonly displayName = "OpenAI Embeddings";

  providerName = "OpenAI";
  private model: OpenAIEmbeddings;

  constructor(apiKey?: string, modelName?: string) {
    let key = apiKey;
    let model = modelName;

    if (!key) {
      const active = ProviderManager.getActive("embedding");
      if (
        active &&
        active.providerName === OpenAIEmbeddingProvider.providerId
      ) {
        key = active.apiKey;
        if (!model) {
          model = active.modelName;
        }
      }
    }

    if (!key) {
      key = llmConfig.OPENAI_API_KEY;
    }

    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is required to initialize OpenAIEmbeddingProvider",
      );
    }

    this.model = new OpenAIEmbeddings({
      apiKey: key,
      model: model || "text-embedding-3-small",
    });
  }

  async embed(text: string): Promise<number[]> {
    return this.model.embedQuery(text);
  }
}
