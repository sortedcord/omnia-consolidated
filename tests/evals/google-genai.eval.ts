import { describe, test, expect } from "vitest";
import { z } from "zod";
import { GeminiProvider, llmConfig } from "@omnia/llm";

describe("GeminiProvider Eval", () => {
  test("structured JSON response against live API", async () => {
    expect(llmConfig.GOOGLE_API_KEY).toBeDefined();
    const provider = new GeminiProvider(llmConfig.GOOGLE_API_KEY);

    const ToneSchema = z.object({
      tone: z.enum(["positive", "negative", "neutral"]),
      confidence: z.number().min(0).max(1),
      explanation: z.string().min(1),
    });

    const response = await provider.generateStructuredResponse({
      systemPrompt:
        "You are a helpful assistant. Classify the tone of the user's sentence.",
      userContext: "I absolutely love this new engine, it works perfectly!",
      schema: ToneSchema,
    });

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    const data = response.data!;
    expect(data.tone).toBe("positive");
    expect(data.confidence).toBeGreaterThan(0.8);
    expect(data.explanation.length).toBeGreaterThan(0);
  });
});
