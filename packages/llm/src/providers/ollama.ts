import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { ILLMProvider, IEmbeddingProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { ProviderManager } from "../provider-manager.js";
import { BaseLLMProvider } from "../base-provider.js";
import {
  registerProvider,
  registerGenerative,
  registerEmbedding,
} from "../registry.js";
import { fetchWithTimeout, type ModelInfo } from "../model-lister.js";

async function fetchOllamaModels(endpointUrl: string): Promise<ModelInfo[]> {
  const base = endpointUrl.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/api/tags`);
  if (!res.ok) return [];

  const json = (await res.json()) as {
    models?: { name: string; model?: string }[];
  };

  return (json.models ?? []).map((m) => ({
    id: m.name,
    name: m.name,
  }));
}

export class OllamaProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "ollama",
      displayName: "Ollama",
      description:
        "Local model runner supporting open-source LLMs via the Ollama server",
      capabilities: { generative: true, embedding: true },
      defaultModel: "llama3.1",
      defaultEmbeddingModel: "nomic-embed-text",
      defaultMaxContext: 32768,
      fallbackPriority: 100,
      listModels: (_apiKey, endpointUrl) =>
        fetchOllamaModels(endpointUrl || "http://localhost:11434"),
    });
    registerGenerative(
      "ollama",
      (inst: ModelProviderInstance) =>
        new OllamaProvider(
          inst.endpointUrl,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new OllamaProvider(
      inst.endpointUrl,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "Ollama";
  protected readonly model: ChatOllama;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 32768;

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
    super();
    let url = baseUrl;
    let model = modelName;
    this.providerInstanceName = providerInstanceName;
    this.maxContextUsed = maxContext;

    if (!url || !model) {
      const active = ProviderManager.getActive("generative");
      if (active && active.providerName === "ollama") {
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

    this.modelNameUsed = model || "llama3.1";
    this.model = new ChatOllama({
      baseUrl: url || "http://localhost:11434",
      model: this.modelNameUsed,
    });
  }
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  static {
    registerEmbedding(
      "ollama",
      (inst: ModelProviderInstance) =>
        new OllamaEmbeddingProvider(inst.endpointUrl, inst.modelName),
    );
  }

  static create(inst: ModelProviderInstance): IEmbeddingProvider {
    return new OllamaEmbeddingProvider(inst.endpointUrl, inst.modelName);
  }

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
      if (active && active.providerName === "ollama") {
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
