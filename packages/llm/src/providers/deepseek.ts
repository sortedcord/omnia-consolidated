import { ChatDeepSeek } from "@langchain/deepseek";
import { ILLMProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import { registerProvider, registerGenerative } from "../registry.js";
import { fetchOpenAICompatibleModels } from "../model-lister.js";

export class DeepSeekProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "deepseek",
      displayName: "DeepSeek",
      description:
        "Official DeepSeek integration using @langchain/deepseek SDK",
      envVar: "DEEPSEEK_API_KEY",
      capabilities: { generative: true, embedding: false },
      defaultModel: "deepseek-chat",
      defaultMaxContext: 64000,
      fallbackPriority: 4,
      listModels: (apiKey) =>
        fetchOpenAICompatibleModels("https://api.deepseek.com", apiKey),
    });
    registerGenerative(
      "deepseek",
      (inst: ModelProviderInstance) =>
        new DeepSeekProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new DeepSeekProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "DeepSeek";
  protected readonly model: ChatDeepSeek;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 64000;

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
      providerId: "deepseek",
      envVarName: "DEEPSEEK_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error(
        "DEEPSEEK_API_KEY is required to initialize DeepSeekProvider",
      );
    }
    this.providerInstanceName = resolvedName;
    this.maxContextUsed = resolvedMax;
    this.modelNameUsed = model || "deepseek-chat";
    this.model = new ChatDeepSeek({ apiKey: key, model: this.modelNameUsed });
  }
}
