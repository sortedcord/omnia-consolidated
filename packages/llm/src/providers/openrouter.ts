import { ChatOpenRouter } from "@langchain/openrouter";
import { ILLMProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import { registerProvider, registerGenerative } from "../registry.js";
import { fetchWithTimeout, type ModelInfo } from "../model-lister.js";

async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/models",
    apiKey
      ? {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        }
      : { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: { id: string; name?: string; owned_by?: string }[];
  };

  return (json.data ?? []).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    ownedBy: m.owned_by,
  }));
}

export class OpenRouterProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "openrouter",
      displayName: "OpenRouter",
      description:
        "Multi-model router supporting Anthropic, OpenAI, DeepSeek, and local models",
      envVar: "OPENROUTER_API_KEY",
      capabilities: { generative: true, embedding: false },
      defaultModel: "google/gemini-2.5-flash",
      defaultEmbeddingModel: "openai/text-embedding-3-small",
      defaultMaxContext: 32768,
      fallbackPriority: 5,
      listModels: fetchOpenRouterModels,
    });
    registerGenerative(
      "openrouter",
      (inst: ModelProviderInstance) =>
        new OpenRouterProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new OpenRouterProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "OpenRouter";
  protected readonly model: ChatOpenRouter;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 32768;

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
      providerId: "openrouter",
      envVarName: "OPENROUTER_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error(
        "OPENROUTER_API_KEY is required to initialize OpenRouterProvider",
      );
    }
    this.providerInstanceName = resolvedName;
    this.maxContextUsed = resolvedMax;
    this.modelNameUsed = model || "google/gemini-2.5-flash";
    this.model = new ChatOpenRouter({ apiKey: key, model: this.modelNameUsed });
  }
}
