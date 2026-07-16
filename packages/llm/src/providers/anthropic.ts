import { ChatAnthropic } from "@langchain/anthropic";
import { ILLMProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import { registerProvider, registerGenerative } from "../registry.js";
import { fetchWithTimeout, type ModelInfo } from "../model-lister.js";

async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  let afterId: string | undefined;

  do {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "1000");
    if (afterId) {
      url.searchParams.set("after_id", afterId);
    }

    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        Accept: "application/json",
      },
    });
    if (!res.ok) return models;

    const json = (await res.json()) as {
      data?: { id: string; display_name?: string }[];
      has_more?: boolean;
      last_id?: string;
    };

    for (const m of json.data ?? []) {
      models.push({ id: m.id, name: m.display_name || m.id });
    }

    afterId = json.has_more ? json.last_id : undefined;
  } while (afterId);

  return models;
}

export class AnthropicProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "anthropic",
      displayName: "Anthropic Claude",
      description: "Official Claude integration using @langchain/anthropic SDK",
      envVar: "ANTHROPIC_API_KEY",
      capabilities: { generative: true, embedding: false },
      defaultModel: "claude-3-5-sonnet-latest",
      defaultMaxContext: 200000,
      fallbackPriority: 2,
      listModels: fetchAnthropicModels,
    });
    registerGenerative(
      "anthropic",
      (inst: ModelProviderInstance) =>
        new AnthropicProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new AnthropicProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "Anthropic";
  protected readonly model: ChatAnthropic;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 200000;

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
      providerId: "anthropic",
      envVarName: "ANTHROPIC_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is required to initialize AnthropicProvider",
      );
    }
    this.providerInstanceName = resolvedName;
    this.maxContextUsed = resolvedMax;
    this.modelNameUsed = model || "claude-3-5-sonnet-latest";
    this.model = new ChatAnthropic({ apiKey: key, model: this.modelNameUsed });
  }
}
