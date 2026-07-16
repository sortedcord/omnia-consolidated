import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelLister } from "@omnia/llm";

describe("ModelLister Unit Tests (Tier 1)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    ModelLister.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns mock provider list instantly without fetch", async () => {
    const models = await ModelLister.listModels("mock", "none");
    expect(models).toEqual([{ id: "mock", name: "Mock Model" }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("fetches and caches OpenAI-compatible models", async () => {
    const mockResponse = {
      data: [
        { id: "gpt-4o", owned_by: "openai" },
        { id: "gpt-4o-mini", owned_by: "openai" },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", mockFetch);

    // First call: Should fetch
    const models = await ModelLister.listModels("openai", "test-key");
    expect(models).toEqual([
      { id: "gpt-4o", name: "gpt-4o", ownedBy: "openai" },
      { id: "gpt-4o-mini", name: "gpt-4o-mini", ownedBy: "openai" },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test-key",
          Accept: "application/json",
        },
      }),
    );

    // Second call: Should read from cache
    const cachedModels = await ModelLister.listModels("openai", "test-key");
    expect(cachedModels).toEqual(models);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("respects cache invalidation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "model-1" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await ModelLister.listModels("openai", "test-key");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Invalidate
    ModelLister.invalidateCache("openai", "test-key");

    // Second call: Should fetch again
    await ModelLister.listModels("openai", "test-key");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("gracefully returns empty array on fetch failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const models = await ModelLister.listModels("openai", "bad-key");
    expect(models).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("handles Gemini pagination correctly", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
            },
          ],
          nextPageToken: "token-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
          ],
        }),
      });

    vi.stubGlobal("fetch", mockFetch);

    const models = await ModelLister.listModels("google-genai", "gemini-key");
    expect(models).toEqual([
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
