import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ILLMProvider, IEmbeddingProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { getLlmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import {
  registerProvider,
  registerGenerative,
  registerEmbedding,
} from "../registry.js";
import { fetchOpenAICompatibleModels } from "../model-lister.js";

export class OpenAIProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "openai",
      displayName: "OpenAI",
      description: "Official OpenAI integration using @langchain/openai SDK",
      envVar: "OPENAI_API_KEY",
      capabilities: { generative: true, embedding: true },
      defaultModel: "gpt-4o-mini",
      defaultEmbeddingModel: "text-embedding-3-small",
      defaultMaxContext: 128000,
      fallbackPriority: 1,
      listModels: (apiKey) =>
        fetchOpenAICompatibleModels("https://api.openai.com/v1", apiKey),
    });
    registerGenerative(
      "openai",
      (inst: ModelProviderInstance) =>
        new OpenAIProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new OpenAIProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "OpenAI";
  protected readonly model: ChatOpenAI;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 128000;

  constructor(
    apiKey?: string,
    modelName?: string,
    providerInstanceName?: string,
    maxContext?: number,
  ) {
    super();
    const {
      key,
      model,
      providerInstanceName: resolvedName,
      maxContext: resolvedMax,
    } = resolveCredentials({
      explicitKey: apiKey,
      explicitModel: modelName,
      explicitProviderInstanceName: providerInstanceName,
      explicitMaxContext: maxContext,
      providerId: "openai",
      envVarName: "OPENAI_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is required to initialize OpenAIProvider",
      );
    }
    this.providerInstanceName = resolvedName;
    this.maxContextUsed = resolvedMax;
    this.modelNameUsed = model || "gpt-4o-mini";
    this.model = new ChatOpenAI({ apiKey: key, model: this.modelNameUsed });
  }
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  static {
    registerEmbedding(
      "openai",
      (inst: ModelProviderInstance) =>
        new OpenAIEmbeddingProvider(inst.apiKey, inst.modelName),
    );
  }

  static create(inst: ModelProviderInstance): IEmbeddingProvider {
    return new OpenAIEmbeddingProvider(inst.apiKey, inst.modelName);
  }

  providerName = "OpenAI";
  private model: OpenAIEmbeddings;

  constructor(apiKey?: string, modelName?: string) {
    let key = apiKey;
    let model = modelName;

    if (!key) {
      const active = ProviderManager.getActive("embedding");
      if (active && active.providerName === "openai") {
        key = active.apiKey;
        if (!model) {
          model = active.modelName;
        }
      }
    }

    if (!key) {
      key = getLlmConfig().OPENAI_API_KEY;
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
