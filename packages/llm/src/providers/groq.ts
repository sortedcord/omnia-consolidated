import { ChatGroq } from "@langchain/groq";
import { ILLMProvider } from "../llm.js";
import type { ModelProviderInstance } from "../llm.js";
import { BaseLLMProvider, resolveCredentials } from "../base-provider.js";
import { registerProvider, registerGenerative } from "../registry.js";
import { fetchOpenAICompatibleModels } from "../model-lister.js";

export class GroqProvider extends BaseLLMProvider {
  static {
    registerProvider({
      id: "groq",
      displayName: "Groq",
      description: "Official Groq integration using @langchain/groq SDK",
      envVar: "GROQ_API_KEY",
      capabilities: { generative: true, embedding: false },
      defaultModel: "llama-3.3-70b-versatile",
      defaultMaxContext: 8192,
      fallbackPriority: 3,
      listModels: (apiKey) =>
        fetchOpenAICompatibleModels("https://api.groq.com/openai/v1", apiKey),
    });
    registerGenerative(
      "groq",
      (inst: ModelProviderInstance) =>
        new GroqProvider(
          inst.apiKey,
          inst.modelName,
          inst.name,
          inst.maxContext,
        ),
    );
  }

  static create(inst: ModelProviderInstance): ILLMProvider {
    return new GroqProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }

  providerName = "Groq";
  protected readonly model: ChatGroq;
  protected modelNameUsed: string;
  protected providerInstanceName?: string;
  protected maxContextUsed?: number;
  protected defaultMaxContext = 8192;

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
      providerId: "groq",
      envVarName: "GROQ_API_KEY",
      type: "generative",
    });
    if (!key) {
      throw new Error("GROQ_API_KEY is required to initialize GroqProvider");
    }
    this.providerInstanceName = resolvedName;
    this.maxContextUsed = resolvedMax;
    this.modelNameUsed = model || "llama-3.3-70b-versatile";
    this.model = new ChatGroq({ apiKey: key, model: this.modelNameUsed });
  }
}
