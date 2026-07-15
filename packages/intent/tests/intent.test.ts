import { describe, test, expect } from "vitest";
import { WorldState, Entity } from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { IntentDecoder, IntentSequence } from "@omnia/intent";

describe("IntentDecoder Unit Tests (Tier 1)", () => {
  test("decodes prose with a single action intent", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    world.addEntity(alice);

    const mockResponse: IntentSequence = {
      intents: [
        {
          type: "action",
          originalText: "Alice opened the chest.",
          description: "Open the wooden chest.",
          selfDescription: "You open the wooden chest.",
          targetIds: [],
          modifiers: [],
        },
      ],
    };

    const llm = new MockLLMProvider([mockResponse]);
    const decoder = new IntentDecoder(llm);

    const result = await decoder.decode(
      world,
      "alice",
      "Alice opened the chest.",
    );

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].type).toBe("action");
    expect(result.intents[0].actorId).toBe("alice");
    expect(result.intents[0].targetIds).toEqual([]);
  });

  test("decodes prose with a single dialogue intent", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    const bob = new Entity("bob");
    world.addEntity(alice);
    world.addEntity(bob);

    const mockResponse: IntentSequence = {
      intents: [
        {
          type: "dialogue",
          originalText: '"Do you have the key?" Alice asked Bob.',
          description: "Alice asks Bob if he has the key.",
          selfDescription: "You ask Bob if he has the key.",
          targetIds: ["bob"],
          modifiers: [],
        },
      ],
    };

    const llm = new MockLLMProvider([mockResponse]);
    const decoder = new IntentDecoder(llm);

    const result = await decoder.decode(
      world,
      "alice",
      '"Do you have the key?" Alice asked Bob.',
    );

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].type).toBe("dialogue");
    expect(result.intents[0].targetIds).toEqual(["bob"]);
  });

  test("decodes prose with mixed dialogue and action intents", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    const bob = new Entity("bob");
    world.addEntity(alice);
    world.addEntity(bob);

    const mockResponse: IntentSequence = {
      intents: [
        {
          type: "dialogue",
          originalText: '"Cover me," Alice whispered to Bob.',
          description: "Alice whispers to Bob requesting cover.",
          selfDescription: "You whisper to Bob requesting cover.",
          targetIds: ["bob"],
          modifiers: [],
        },
        {
          type: "action",
          originalText: "She crept towards the door and pulled the handle.",
          description: "Creep towards the door and pull the handle.",
          selfDescription: "You creep towards the door and pull the handle.",
          targetIds: [],
          modifiers: [],
        },
      ],
    };

    const llm = new MockLLMProvider([mockResponse]);
    const decoder = new IntentDecoder(llm);

    const result = await decoder.decode(
      world,
      "alice",
      '"Cover me," Alice whispered to Bob. She crept towards the door and pulled the handle.',
    );

    expect(result.intents).toHaveLength(2);
    expect(result.intents[0].type).toBe("dialogue");
    expect(result.intents[0].targetIds).toEqual(["bob"]);
    expect(result.intents[1].type).toBe("action");
    expect(result.intents[1].actorId).toBe("alice");
  });

  test("throws on LLM failure", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    world.addEntity(alice);

    // MockLLMProvider with empty queue will return { success: false }
    const llm = new MockLLMProvider([]);
    const decoder = new IntentDecoder(llm);

    await expect(
      decoder.decode(world, "alice", "Alice ran away."),
    ).rejects.toThrow("Intent decoding failed");
  });
});
