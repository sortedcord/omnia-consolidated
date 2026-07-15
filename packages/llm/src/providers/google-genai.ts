import { z } from "zod";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
  IEmbeddingProvider,
} from "../llm.js";
import { llmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";

export class GeminiProvider implements ILLMProvider {
  static readonly providerId = "google-genai";
  static readonly displayName = "Google Gemini";
  static readonly description =
    "Official Gemini integration using Google Gen AI SDK";
  static readonly defaultModel = "gemini-2.5-flash";

  providerName = "Gemini";
  private model: ChatGoogleGenerativeAI;
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
      if (active && active.providerName === GeminiProvider.providerId) {
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
      key = llmConfig.GOOGLE_API_KEY;
      if (!this.providerInstanceName && key) {
        this.providerInstanceName = "Environment Variable";
      }
    }

    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY is required to initialize GeminiProvider",
      );
    }

    this.modelNameUsed = model || "gemini-2.5-flash";
    this.model = new ChatGoogleGenerativeAI({
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
        this.maxContextUsed !== undefined ? this.maxContextUsed : 32768,
    };

    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
    });

    return { success: true, data: parsed, usage };
  }
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  static readonly providerId = "google-genai";
  static readonly displayName = "Google Gemini Embeddings";

  providerName = "Gemini";
  private model: GoogleGenerativeAIEmbeddings;

  constructor(apiKey?: string, modelName?: string) {
    let key = apiKey;
    let model = modelName;

    if (!key) {
      const active = ProviderManager.getActive("embedding");
      if (active) {
        key = active.apiKey;
        if (!model) {
          model = active.modelName;
        }
      }
    }

    if (!key) {
      key = llmConfig.GOOGLE_API_KEY;
    }

    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY is required to initialize GeminiEmbeddingProvider",
      );
    }

    this.model = new GoogleGenerativeAIEmbeddings({
      apiKey: key,
      modelName: model || "gemini-embedding-001",
    });
  }

  async embed(text: string): Promise<number[]> {
    return this.model.embedQuery(text);
  }
}
