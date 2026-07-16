import { z } from "zod";
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
  IEmbeddingProvider,
} from "../llm.js";
import { ProviderManager } from "../provider-manager.js";

export class OllamaProvider implements ILLMProvider {
  static readonly providerId = "ollama";
  static readonly displayName = "Ollama";
  static readonly description =
    "Local model runner supporting open-source LLMs via the Ollama server";
  static readonly defaultModel = "llama3.1";

  providerName = "Ollama";
  private model: ChatOllama;
  private modelNameUsed: string;
  private providerInstanceName?: string;
  private maxContextUsed?: number;
  lastCalls: LLMCallRecord[] = [];

  /**
   * Creates an OllamaProvider.
   *
   * Resolution order for configuration:
   *  1. Explicit constructor arguments
   *  2. Active "generative" instance in ProviderManager whose providerName === "ollama"
   *  3. Defaults (baseUrl: http://localhost:11434, model: llama3.1)
   *
   * No API key is required for Ollama. The `endpointUrl` in
   * ModelProviderInstance stores the Ollama server base URL
   * (e.g. "http://localhost:11434").
   */
  constructor(
    baseUrl?: string,
    modelName?: string,
    providerInstanceName?: string,
    maxContext?: number,
  ) {
    let url = baseUrl;
    let model = modelName;
    this.providerInstanceName = providerInstanceName;
    this.maxContextUsed = maxContext;

    if (!url || !model) {
      const active = ProviderManager.getActive("generative");
      if (active && active.providerName === OllamaProvider.providerId) {
        if (!url) {
          url = active.endpointUrl;
        }
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

    this.modelNameUsed = model || OllamaProvider.defaultModel;
    this.model = new ChatOllama({
      baseUrl: url || "http://localhost:11434",
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

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  static readonly providerId = "ollama";
  static readonly displayName = "Ollama Embeddings";

  providerName = "Ollama";
  private model: OllamaEmbeddings;

  /**
   * Creates an OllamaEmbeddingProvider.
   *
   * Resolution order:
   *  1. Explicit constructor arguments
   *  2. Active "embedding" instance in ProviderManager
   *  3. Defaults (baseUrl: http://localhost:11434, model: nomic-embed-text)
   *
   * The `endpointUrl` field in ModelProviderInstance stores the base URL.
   */
  constructor(baseUrl?: string, modelName?: string) {
    let url = baseUrl;
    let model = modelName;

    if (!url || !model) {
      const active = ProviderManager.getActive("embedding");
      if (
        active &&
        active.providerName === OllamaEmbeddingProvider.providerId
      ) {
        if (!url) {
          url = active.endpointUrl;
        }
        if (!model) {
          model = active.modelName;
        }
      }
    }

    this.model = new OllamaEmbeddings({
      baseUrl: url || "http://localhost:11434",
      model: model || "nomic-embed-text",
    });
  }

  async embed(text: string): Promise<number[]> {
    return this.model.embedQuery(text);
  }
}
