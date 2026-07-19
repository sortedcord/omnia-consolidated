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

import {
  OpenAIProvider,
  OpenAIEmbeddingProvider,
} from "../src/providers/openai.js";

// Mock the ChatOpenAI and OpenAIEmbeddings classes
vi.mock("@langchain/openai", () => {
  return {
    ChatOpenAI: class {
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
    OpenAIEmbeddings: class {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      embedQuery = vi.fn().mockImplementation(async (text: string) => {
        return [0.1, 0.2, 0.3];
      });
    },
  };
});

describe("OpenAIProvider Unit Tests (Tier 1)", () => {
  test("initializes successfully with a provided apiKey", () => {
    const provider = new OpenAIProvider("dummy-key");
    expect(provider.providerName).toBe("OpenAI");
  });

  test("initializes successfully with apiKey from config", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-dummy-key";
    mockConfig.OPENAI_API_KEY = "env-dummy-key";

    try {
      const provider = new OpenAIProvider();
      expect(provider.providerName).toBe("OpenAI");
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
      delete mockConfig.OPENAI_API_KEY;
    }
  });

  test("throws error if no API key is provided or in config", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = undefined;
    mockConfig.OPENAI_API_KEY = undefined;

    try {
      expect(() => new OpenAIProvider()).toThrow(
        "OPENAI_API_KEY is required to initialize OpenAIProvider",
      );
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  test("generateStructuredResponse invokes the model with structured output, records usage and updates lastCalls", async () => {
    const provider = new OpenAIProvider("dummy-key");
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
      modelName: "gpt-4o-mini",
      providerInstanceName: "Default",
      maxContext: 128000,
    });

    expect(provider.lastCalls.length).toBe(1);
  });
});

describe("OpenAIEmbeddingProvider Unit Tests (Tier 1)", () => {
  test("initializes successfully with a provided apiKey", () => {
    const provider = new OpenAIEmbeddingProvider("dummy-key");
    expect(provider.providerName).toBe("OpenAI");
  });

  test("initializes successfully with apiKey from config", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-dummy-key";
    mockConfig.OPENAI_API_KEY = "env-dummy-key";

    try {
      const provider = new OpenAIEmbeddingProvider();
      expect(provider.providerName).toBe("OpenAI");
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
      delete mockConfig.OPENAI_API_KEY;
    }
  });

  test("embed returns dummy array successfully", async () => {
    const provider = new OpenAIEmbeddingProvider("dummy-key");
    const result = await provider.embed("hello");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});
