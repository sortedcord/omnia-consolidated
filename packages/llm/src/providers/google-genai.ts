import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import type {
  ILLMProvider,
  IEmbeddingProvider,
  ModelProviderInstance,
} from "../llm.js";
import {
  registerProvider,
  registerGenerative,
  registerEmbedding,
} from "../registry.js";
import { fetchWithTimeout, type ModelInfo } from "../model-lister.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import { getLlmConfig } from "../config.js";
import { ProviderManager } from "../provider-manager.js";

async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) return models;

    const json = (await res.json()) as {
      models?: { name: string; displayName?: string }[];
      nextPageToken?: string;
    };

    for (const m of json.models ?? []) {
      const id = m.name.replace(/^models\//, "");
      models.push({ id, name: m.displayName || id });
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return models;
}

export class GeminiProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "google-genai",
      displayName: "Google Gemini",
      description: "Official Gemini integration using Google Gen AI SDK",
      envVar: "GOOGLE_API_KEY",
      capabilities: { generative: true, embedding: true },
      defaultModel: "gemini-2.5-flash",
      defaultEmbeddingModel: "gemini-embedding-001",
      defaultMaxContext: 32768,
      fallbackPriority: 0,
      listModels: fetchGeminiModels,
    });
    registerGenerative(
      "google-genai",
      (inst: ModelProviderInstance) =>
        new GeminiProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  providerName = "Gemini";
  protected readonly model: ChatGoogleGenerativeAI;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected readonly defaultMaxContext = 32768;

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new GeminiProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

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
      providerInstanceName: pn,
      maxContext: mc,
    } = resolveCredentials({
      explicitKey: apiKey,
      explicitModel: modelName,
      explicitProviderInstanceName: providerInstanceName,
      explicitMaxContext: maxContext,
      providerId: "google-genai",
      envVarName: "GOOGLE_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY is required to initialize GeminiProvider",
      );
    }
    this.providerInstanceName = pn;
    this.maxContextUsed = mc;
    this.modelNameUsed = model || "gemini-2.5-flash";
    this.model = new ChatGoogleGenerativeAI({
      apiKey: key,
      model: this.modelNameUsed,
    });
  }
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  static {
    registerEmbedding(
      "google-genai",
      (inst: ModelProviderInstance) =>
        new GeminiEmbeddingProvider(inst.apiKey, inst.modelName),
    );
  }

  providerName = "Gemini";
  private model: GoogleGenerativeAIEmbeddings;

  static create(inst: ModelProviderInstance): IEmbeddingProvider {
    return new GeminiEmbeddingProvider(inst.apiKey, inst.modelName);
  }

  constructor(apiKey?: string, modelName?: string) {
    let key = apiKey;
    let model = modelName;

    if (!key) {
      const active = ProviderManager.getActive("embedding");
      if (active && active.providerName === "google-genai") {
        key = active.apiKey;
        if (!model) model = active.modelName;
      }
    }

    if (!key) {
      key = getLlmConfig().GOOGLE_API_KEY;
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
