import {
  GeminiProvider,
  MockLLMProvider,
  ProviderManager,
  OpenRouterProvider,
  GeminiEmbeddingProvider,
  MockEmbeddingProvider,
} from "@omnia/llm";
import type {
  ILLMProvider,
  IEmbeddingProvider,
  ModelProviderInstance,
} from "@omnia/llm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedProviders {
  actorProvider: ILLMProvider;
  validatorProvider: ILLMProvider;
  decoderProvider: ILLMProvider;
  timedeltaProvider: ILLMProvider;
  handoffProvider: ILLMProvider;
  embeddingProvider: IEmbeddingProvider;
}

export interface ProviderResolverOptions {
  /**
   * Pre-resolved generative instance to fall back to when ProviderManager has
   * no active generative provider (e.g. when the caller already validated a
   * specific provider during session creation).
   */
  fallbackInstance?: ModelProviderInstance | null;
  /**
   * When true, throws an Error if no provider can be resolved for a task.
   * When false (default), falls back silently to MockLLMProvider / MockEmbeddingProvider.
   */
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Private builders
// ---------------------------------------------------------------------------

function buildLLMProvider(inst: ModelProviderInstance): ILLMProvider {
  if (inst.providerName === "google-genai") {
    return new GeminiProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  } else if (inst.providerName === "openrouter") {
    return new OpenRouterProvider(
      inst.apiKey,
      inst.modelName,
      inst.name,
      inst.maxContext,
    );
  }
  return new MockLLMProvider([]);
}

function buildEmbeddingProvider(
  inst: ModelProviderInstance,
): IEmbeddingProvider {
  if (inst.providerName === "google-genai") {
    return new GeminiEmbeddingProvider(inst.apiKey, inst.modelName);
  }
  return new MockEmbeddingProvider(inst.modelName);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves all six LLM + embedding providers needed for a simulation session.
 *
 * Resolution order for each generative task:
 *  1. Task-specific mapping from ProviderManager (via `mappings[task]`)
 *  2. ProviderManager active generative instance
 *  3. `fallbackInstance` (if supplied)
 *  4. GOOGLE_API_KEY env var → auto-creates a temporary GeminiProvider
 *  5. Throws (if `required`) or returns MockLLMProvider
 */
export function resolveProviders(
  mappings: Record<string, string>,
  options: ProviderResolverOptions = {},
): ResolvedProviders {
  const { fallbackInstance = null, required = false } = options;
  const list = ProviderManager.list();
  const activeGenerative =
    ProviderManager.getActive("generative") ?? fallbackInstance ?? null;

  const resolveGenerative = (task: string): ILLMProvider => {
    const mappedId = mappings[task];
    let inst: ModelProviderInstance | null = mappedId
      ? (list.find((p) => p.id === mappedId) ?? null)
      : null;

    if (!inst || inst.type !== "generative") {
      inst = activeGenerative;
    }

    if (!inst) {
      const envKey = process.env.GOOGLE_API_KEY;
      if (envKey) {
        inst = ProviderManager.create(
          "Default (Env)",
          "google-genai",
          envKey,
          undefined,
          "generative",
        );
      }
    }

    if (!inst) {
      if (required) {
        throw new Error(
          `No active LLM Provider Instance found for task "${task}". Please configure a key in Settings first.`,
        );
      }
      return new MockLLMProvider([]);
    }

    return buildLLMProvider(inst);
  };

  const resolveEmbedding = (): IEmbeddingProvider => {
    const mappedId = mappings["embeddings"];
    let inst: ModelProviderInstance | null = mappedId
      ? (list.find((p) => p.id === mappedId) ?? null)
      : null;

    if (!inst || inst.type !== "embedding") {
      inst = ProviderManager.getActive("embedding");
    }

    if (!inst) {
      const envKey = process.env.GOOGLE_API_KEY;
      if (envKey) {
        inst = ProviderManager.create(
          "Default Embed (Env)",
          "google-genai",
          envKey,
          "gemini-embedding-001",
          "embedding",
        );
      }
    }

    if (!inst) {
      if (required) {
        throw new Error(
          `No active Embedding Provider Instance found. Please configure an embedding key in Settings first.`,
        );
      }
      return new MockEmbeddingProvider(undefined);
    }

    return buildEmbeddingProvider(inst);
  };

  return {
    actorProvider: resolveGenerative("actor-prose"),
    validatorProvider: resolveGenerative("llm-validator"),
    decoderProvider: resolveGenerative("intent-decoder"),
    timedeltaProvider: resolveGenerative("timedelta"),
    handoffProvider: resolveGenerative("handoff"),
    embeddingProvider: resolveEmbedding(),
  };
}
