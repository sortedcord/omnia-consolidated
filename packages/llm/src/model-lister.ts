/**
 * ModelLister — fetches available models from each provider's REST API.
 * Results are cached in-memory with a 5-minute TTL to avoid repeated calls.
 */

import { ProviderRegistry } from "./registry.js";

export interface ModelInfo {
  id: string;
  name: string;
  ownedBy?: string;
}

interface CacheEntry {
  models: ModelInfo[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const modelCache = new Map<string, CacheEntry>();

function cacheKey(
  providerName: string,
  apiKey: string,
  endpointUrl?: string,
): string {
  return `${providerName}:${endpointUrl || apiKey}`;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelInfo[]> {
  const res = await fetchWithTimeout(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: { id: string; owned_by?: string; name?: string }[];
  };

  return (json.data ?? []).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    ownedBy: m.owned_by,
  }));
}

export class ModelLister {
  static async listModels(
    providerName: string,
    apiKey: string,
    endpointUrl?: string,
  ): Promise<ModelInfo[]> {
    const key = cacheKey(providerName, apiKey, endpointUrl);
    const cached = modelCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.models;
    }

    const def = ProviderRegistry.get(providerName);
    let models: ModelInfo[] = [];
    try {
      if (def?.listModels) {
        models = await def.listModels(apiKey, endpointUrl);
      }
    } catch {
      models = [];
    }

    modelCache.set(key, { models, fetchedAt: Date.now() });
    return models;
  }

  static invalidateCache(
    providerName: string,
    apiKey: string,
    endpointUrl?: string,
  ): void {
    modelCache.delete(cacheKey(providerName, apiKey, endpointUrl));
  }

  static clearCache(): void {
    modelCache.clear();
  }
}
