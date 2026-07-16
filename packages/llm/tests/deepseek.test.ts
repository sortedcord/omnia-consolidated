import { describe, test, expect, vi } from "vitest";
import { z } from "zod";

const mockConfig: Record<string, string | undefined> = {};

vi.mock("../src/config.js", () => ({
  getLlmConfig: () => mockConfig,
  resetLlmConfig: () => {
    for (const key of Object.keys(mockConfig)) {
      delete mockConfig[key];
    }
  },
}));

const { getActiveMock } = vi.hoisted(() => ({
  getActiveMock: vi.fn().mockReturnValue(null),
}));

vi.mock("../src/provider-manager.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/provider-manager.js")>();
  return {
    ...actual,
    ProviderManager: {
      ...actual.ProviderManager,
      getActive: getActiveMock,
    },
  };
});

import { DeepSeekProvider } from "../src/providers/deepseek.js";

// Mock the ChatDeepSeek class
vi.mock("@langchain/deepseek", () => {
  return {
    ChatDeepSeek: class {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
      withStructuredOutput = vi.fn().mockImplementation(() => {
        return {
          invoke: vi.fn().mockImplementation(async () => {
            return {
              parsed: {
                name: "mocked response",
                success: true,
              },
              raw: {
                usage_metadata: {
                  input_tokens: 10,
                  output_tokens: 5,
                  total_tokens: 15,
                },
              },
            };
          }),
        };
      });
    },
  };
});

describe("DeepSeekProvider Unit Tests (Tier 1)", () => {
  test("initializes successfully with a provided apiKey", () => {
    const provider = new DeepSeekProvider("dummy-key");
    expect(provider.providerName).toBe("DeepSeek");
  });

  test("initializes successfully with apiKey from config", () => {
    const originalKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "env-dummy-key";
    mockConfig.DEEPSEEK_API_KEY = "env-dummy-key";

    try {
      const provider = new DeepSeekProvider();
      expect(provider.providerName).toBe("DeepSeek");
    } finally {
      process.env.DEEPSEEK_API_KEY = originalKey;
      delete mockConfig.DEEPSEEK_API_KEY;
    }
  });

  test("throws error if no API key is provided or in config", () => {
    const originalKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = undefined;
    mockConfig.DEEPSEEK_API_KEY = undefined;

    try {
      expect(() => new DeepSeekProvider()).toThrow(
        "DEEPSEEK_API_KEY is required to initialize DeepSeekProvider",
      );
    } finally {
      process.env.DEEPSEEK_API_KEY = originalKey;
    }
  });

  test("generateStructuredResponse invokes the model with structured output, records usage and updates lastCalls", async () => {
    const provider = new DeepSeekProvider("dummy-key");
    const TestSchema = z.object({
      name: z.string(),
      success: z.boolean(),
    });

    const response = await provider.generateStructuredResponse({
      systemPrompt: "system prompt",
      userContext: "user context",
      schema: TestSchema,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({
      name: "mocked response",
      success: true,
    });

    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      modelName: "deepseek-chat",
      providerInstanceName: "Default",
      maxContext: 64000,
    });

    expect(provider.lastCalls.length).toBe(1);
  });
});
