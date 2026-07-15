import { describe, test, expect, vi } from "vitest";
import { z } from "zod";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import { llmConfig } from "../src/config.js";

// Mock the ChatOpenRouter class
vi.mock("@langchain/openrouter", () => {
  return {
    ChatOpenRouter: class {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
      withStructuredOutput = vi.fn().mockImplementation(() => {
        return {
          invoke: vi.fn().mockImplementation(async () => {
            // Return a mock output that matches the includeRaw: true structure
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

describe("OpenRouterProvider Unit Tests (Tier 1)", () => {
  test("initializes successfully with a provided apiKey", () => {
    const provider = new OpenRouterProvider("dummy-key");
    expect(provider.providerName).toBe("OpenRouter");
  });

  test("initializes successfully with apiKey from config", () => {
    // Save current config
    const originalKey = llmConfig.OPENROUTER_API_KEY;
    llmConfig.OPENROUTER_API_KEY = "env-dummy-key";

    try {
      const provider = new OpenRouterProvider();
      expect(provider.providerName).toBe("OpenRouter");
    } finally {
      llmConfig.OPENROUTER_API_KEY = originalKey;
    }
  });

  test("throws error if no API key is provided or in config", () => {
    // Save current config
    const originalKey = llmConfig.OPENROUTER_API_KEY;
    llmConfig.OPENROUTER_API_KEY = undefined;

    try {
      expect(() => new OpenRouterProvider()).toThrow(
        "OPENROUTER_API_KEY is required to initialize OpenRouterProvider",
      );
    } finally {
      llmConfig.OPENROUTER_API_KEY = originalKey;
    }
  });

  test("generateStructuredResponse invokes the model with structured output, records usage and updates lastCalls", async () => {
    const provider = new OpenRouterProvider("dummy-key");
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
      modelName: "google/gemini-2.5-flash",
      providerInstanceName: "Default",
      maxContext: 32768,
    });

    expect(provider.lastCalls.length).toBe(1);
    expect(provider.lastCalls[0]).toEqual({
      systemPrompt: "system prompt",
      userContext: "user context",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        modelName: "google/gemini-2.5-flash",
        providerInstanceName: "Default",
        maxContext: 32768,
      },
    });
  });
});
