import { describe, test, expect } from "vitest";
import { WorldState } from "@omnia/core";
import { Entity } from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { Architect } from "@omnia/architect";

describe("Architect & LLMValidator Unit Tests (Tier 1)", () => {
  test("returns valid response when LLM validates intent as successful", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    world.addEntity(alice);

    const mockResponse = {
      isValid: true,
      reason: "Alice is in the room and the chest is unlocked.",
    };
    const llmProvider = new MockLLMProvider([mockResponse]);
    const architect = new Architect(llmProvider);

    const result = await architect.validateIntent(
      world,
      "alice",
      "open the chest and read the scroll",
    );

    expect(result.isValid).toBe(true);
    expect(result.reason).toBe(
      "Alice is in the room and the chest is unlocked.",
    );
  });

  test("returns invalid response when LLM denies the intent", async () => {
    const world = new WorldState("world-1");
    const bob = new Entity("bob");
    world.addEntity(bob);

    // Setup mock LLM response
    const mockResponse = {
      isValid: false,
      reason: "Bob does not have the key to the iron gate.",
    };
    const llmProvider = new MockLLMProvider([mockResponse]);
    const architect = new Architect(llmProvider);

    const result = await architect.validateIntent(
      world,
      "bob",
      "unlock the gate and escape",
    );

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Bob does not have the key to the iron gate.");
  });

  test("returns invalid response immediately if actor does not exist", async () => {
    const world = new WorldState("world-1");
    // No entities added

    const llmProvider = new MockLLMProvider([]); // No mock responses because it shouldn't be called
    const architect = new Architect(llmProvider);

    const result = await architect.validateIntent(
      world,
      "ghost",
      "haunt the mansion",
    );

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain(
      'Actor entity with ID "ghost" does not exist',
    );
  });
});
