import type {
  ILLMProvider,
  IEmbeddingProvider,
  ModelProviderInstance,
} from "./llm.js";
import { MockLLMProvider, MockEmbeddingProvider } from "./providers/mock.js";
import { ProviderRegistry } from "./registry.js";

export function buildLLMProvider(inst: ModelProviderInstance): ILLMProvider {
  const def = ProviderRegistry.get(inst.providerName);
  return def?.generativeCreate?.(inst) ?? new MockLLMProvider([]);
}

export function buildEmbeddingProvider(
  inst: ModelProviderInstance,
): IEmbeddingProvider {
  const def = ProviderRegistry.get(inst.providerName);
  return (
    def?.embeddingCreate?.(inst) ?? new MockEmbeddingProvider(inst.modelName)
  );
}
