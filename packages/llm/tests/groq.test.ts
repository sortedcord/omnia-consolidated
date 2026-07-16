import { describe, test, expect, vi } from "vitest";
import { z } from "zod";
import { GroqProvider } from "../src/providers/groq.js";
import { llmConfig } from "../src/config.js";

// Mock the ChatGroq class
vi.mock("@langchain/groq", () => {
  return {
    ChatGroq: class {
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

describe("GroqProvider Unit Tests (Tier 1)", () => {
  test("initializes successfully with a provided apiKey", () => {
    const provider = new GroqProvider("dummy-key");
    expect(provider.providerName).toBe("Groq");
  });

  test("initializes successfully with apiKey from config", () => {
    const originalKey = llmConfig.GROQ_API_KEY;
    llmConfig.GROQ_API_KEY = "env-dummy-key";

    try {
      const provider = new GroqProvider();
      expect(provider.providerName).toBe("Groq");
    } finally {
      llmConfig.GROQ_API_KEY = originalKey;
    }
  });

  test("throws error if no API key is provided or in config", () => {
    const originalKey = llmConfig.GROQ_API_KEY;
    llmConfig.GROQ_API_KEY = undefined;

    try {
      expect(() => new GroqProvider()).toThrow(
        "GROQ_API_KEY is required to initialize GroqProvider",
      );
    } finally {
      llmConfig.GROQ_API_KEY = originalKey;
    }
  });

  test("generateStructuredResponse invokes the model with structured output, records usage and updates lastCalls", async () => {
    const provider = new GroqProvider("dummy-key");
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
      modelName: "llama-3.3-70b-versatile",
      providerInstanceName: "Default",
      maxContext: 8192,
    });

    expect(provider.lastCalls.length).toBe(1);
  });
});
