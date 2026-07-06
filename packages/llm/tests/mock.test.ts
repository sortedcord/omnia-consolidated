import { describe, test, expect } from "vitest";
import { z } from "zod";
import { MockLLMProvider } from "../src/providers/mock.js";

describe("MockLLMProvider Unit Tests (Tier 1)", () => {
  test("returns parsed matching data for valid mock response", async () => {
    const TestSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const mockData = { name: "Alice", age: 30 };
    const provider = new MockLLMProvider([mockData]);

    const response = await provider.generateStructuredResponse({
      systemPrompt: "system prompt",
      userContext: "user context",
      schema: TestSchema,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual(mockData);
  });

  test("returns failure for malformed mock response", async () => {
    const TestSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    // age is a string instead of a number, which violates schema
    const malformedData = { name: "Alice", age: "thirty" };
    const provider = new MockLLMProvider([malformedData]);

    const response = await provider.generateStructuredResponse({
      systemPrompt: "system prompt",
      userContext: "user context",
      schema: TestSchema,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.data).toBeUndefined();
  });

  test("returns failure when mock responses are exhausted", async () => {
    const TestSchema = z.object({
      name: z.string(),
    });

    const provider = new MockLLMProvider([]);

    const response = await provider.generateStructuredResponse({
      systemPrompt: "system prompt",
      userContext: "user context",
      schema: TestSchema,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe("Mock responses exhausted");
    expect(response.data).toBeUndefined();
  });
});
