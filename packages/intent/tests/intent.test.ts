import { describe, test, expect } from "vitest";
import { WorldState, Entity } from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { IntentDecoder } from "@omnia/intent";

describe("IntentDecoder Unit Tests (Tier 1)", () => {
  test("decodes prose with a single action intent", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    world.addEntity(alice);

    const mockResponse = {
      intents: [
        {
          type: "action",
          content: "I open the wooden chest.",
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
    expect(result.intents[0].content).toContain("entity@alice[I]");
    expect(result.intents[0].targetIds).toEqual([]);
  });

  test("decodes prose with a single dialogue intent", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    const bob = new Entity("bob");
    world.addEntity(alice);
    world.addEntity(bob);

    const mockResponse = {
      intents: [
        {
          type: "dialogue",
          content: '"Do you have the key?" I asked Bob.',
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
    expect(result.intents[0].content).toContain("entity@alice[I]");
    expect(result.intents[0].targetIds).toEqual(["bob"]);
  });

  test("decodes prose with mixed dialogue and action intents", async () => {
    const world = new WorldState("world-1");
    const alice = new Entity("alice");
    const bob = new Entity("bob");
    world.addEntity(alice);
    world.addEntity(bob);

    const mockResponse = {
      intents: [
        {
          type: "dialogue",
          content: '"Cover me," I whispered to Bob.',
          targetIds: ["bob"],
          modifiers: [],
        },
        {
          type: "action",
          content: "I crept towards the door and pulled the handle.",
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
    expect(result.intents[1].content).toContain("entity@alice[I]");
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
