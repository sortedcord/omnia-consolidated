import { describe, test, expect } from "vitest";
import { WorldState, Entity } from "@omnia/core";
import { GeminiProvider, llmConfig } from "@omnia/llm";
import { IntentDecoder } from "@omnia/intent";

describe("IntentDecoder Live Eval (Tier 3)", () => {
  test("decodes real complex narrative prose using live Gemini API", async () => {
    expect(llmConfig.GOOGLE_API_KEY).toBeDefined();

    // 1. Initialize live provider and decoder
    const provider = new GeminiProvider(llmConfig.GOOGLE_API_KEY);
    const decoder = new IntentDecoder(provider);

    // 2. Setup a mock world state for target reference resolution
    const world = new WorldState("world-xyz");
    const alice = new Entity("alice");
    const bob = new Entity("bob");
    world.addEntity(alice);
    world.addEntity(bob);

    // 3. Narrative prose containing both a dialogue and physical action
    const narrativeProse =
      '"Let\'s see if this key opens the main vault," Alice said to Bob. She slipped the silver key into the keyhole and turned it slowly.';

    // 4. Decode prose using live Gemini model
    const result = await decoder.decode(world, "alice", narrativeProse);

    // 5. Assert structure and content correctness
    expect(result).toBeDefined();
    expect(result.intents).toBeDefined();
    expect(result.intents.length).toBeGreaterThanOrEqual(1);

    // Verify first intent is dialogue spoken to Bob
    const dialogueIntent = result.intents.find((i) => i.type === "dialogue");
    expect(dialogueIntent).toBeDefined();
    expect(dialogueIntent!.actorId).toBe("alice");
    expect(dialogueIntent!.targetIds).toContain("bob");
    expect(dialogueIntent!.originalText).toContain(
      "Let's see if this key opens the main vault",
    );

    // Verify second intent is action
    const actionIntent = result.intents.find((i) => i.type === "action");
    expect(actionIntent).toBeDefined();
    expect(actionIntent!.actorId).toBe("alice");
    expect(actionIntent!.originalText).toContain("slipped the silver key");
  }, 15000);

  test("resolves targets correctly using the actor's subjective alias map", async () => {
    expect(llmConfig.GOOGLE_API_KEY).toBeDefined();

    const provider = new GeminiProvider(llmConfig.GOOGLE_API_KEY);
    const decoder = new IntentDecoder(provider);

    const world = new WorldState("world-xyz");
    const alice = new Entity("alice");
    const bob = new Entity("bob");

    // Register alias mapping: Bob is known to Alice as "the hooded stranger"
    alice.aliases.set("bob", "the hooded stranger");

    world.addEntity(alice);
    world.addEntity(bob);

    // Narrative prose referring to Bob only by the subjective alias
    const narrativeProse =
      "Alice handed the silver key to the hooded stranger.";

    const result = await decoder.decode(world, "alice", narrativeProse);

    expect(result.intents).toHaveLength(1);
    const intent = result.intents[0];

    expect(intent.type).toBe("action");
    expect(intent.actorId).toBe("alice");
    // Verify target resolution resolved the alias back to the correct system entity ID
    expect(intent.targetIds).toContain("bob");
  }, 15000);
});
