import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import {
  WorldState,
  Entity,
  SQLiteRepository,
  AttributeVisibility,
} from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { IntentDecoder, IntentSequence } from "@omnia/intent";
import { Architect } from "@omnia/architect";

describe("Omnia Integration Tests (Tier 2)", () => {
  test("end-to-end intent decoding, validation, execution, and persistence", async () => {
    const db = new Database(":memory:");
    const repo = new SQLiteRepository(db);

    const startTime = new Date("2026-07-06T12:00:00.000Z");
    const world = new WorldState("world-abc", startTime);
    world.addAttribute("location", "Dungeon Crawl", AttributeVisibility.PUBLIC);

    const alice = new Entity("alice", "room-1");
    alice.addAttribute("role", "rogue", AttributeVisibility.PUBLIC);
    world.addEntity(alice);

    const bob = new Entity("bob", "room-1");
    bob.addAttribute("role", "knight", AttributeVisibility.PUBLIC);
    world.addEntity(bob);

    // Save initial state to database
    repo.saveWorldState(world);

    // Mock responses for LLM:
    // 1. IntentDecoder parses: `"Cover me," Alice whispered to Bob. She crept towards the door and pulled the handle.`
    const mockIntentSequence: IntentSequence = {
      intents: [
        {
          type: "dialogue",
          originalText: '"Cover me," Alice whispered to Bob.',
          description: "Alice whispers to Bob to cover her.",
          selfDescription: "You whisper to Bob to cover you.",
          actorId: "alice",
          targetIds: ["bob"],
          modifiers: [],
        },
        {
          type: "action",
          originalText: "She crept towards the door and pulled the handle.",
          description: "Alice creeps to the door and pulls the handle.",
          selfDescription: "You creep to the door and pull the handle.",
          actorId: "alice",
          targetIds: [],
          modifiers: [],
        },
      ],
    };

    // 2. Architect validation & delta generation responses
    const mockDialogueValidation = {
      isValid: true,
      reason: "Alice is able to speak to Bob.",
    };

    const mockActionValidation = {
      isValid: true,
      reason: "The door is unlocked and reachable.",
    };
    const mockActionTimeDelta = {
      minutesToAdvance: 3,
      explanation: "Creeping silently and opening a door takes 3 minutes.",
    };

    const llmProvider = new MockLLMProvider([
      mockIntentSequence, // Used by IntentDecoder
      mockDialogueValidation, // Used by Architect.validateIntent (Dialogue)
      mockActionValidation, // Used by Architect.validateIntent (Action)
      mockActionTimeDelta, // Used by TimeDeltaGenerator (Action)
    ]);

    const decoder = new IntentDecoder(llmProvider);
    const architect = new Architect(llmProvider, repo);

    // 1. Decode the raw prose into structured intents
    const narrativeProse =
      '"Cover me," Alice whispered to Bob. She crept towards the door and pulled the handle.';
    const decodedSequence = await decoder.decode(
      world,
      "alice",
      narrativeProse,
    );

    expect(decodedSequence.intents).toHaveLength(2);

    // 2. Process first intent (dialogue)
    const result1 = await architect.processIntent(
      world,
      decodedSequence.intents[0],
    );
    expect(result1.isValid).toBe(true);
    expect(result1.timeDelta!.minutesToAdvance).toBe(1);

    // 3. Process second intent (action)
    const result2 = await architect.processIntent(
      world,
      decodedSequence.intents[1],
    );
    expect(result2.isValid).toBe(true);
    expect(result2.timeDelta!.minutesToAdvance).toBe(3);

    // 4. Verify local state clock advanced by the time deltas
    const expectedTime = new Date(startTime.getTime() + 4 * 60_000); // 4 minutes total (dialogue 1 + action 3)
    expect(world.clock.get().toISOString()).toBe(expectedTime.toISOString());

    // 5. Verify database state clock was advanced and persisted
    const reloadedWorld = repo.loadWorldState("world-abc")!;
    expect(reloadedWorld.clock.get().toISOString()).toBe(
      expectedTime.toISOString(),
    );

    db.close();
  });

  test("handles sequence containing rejected action correctly", async () => {
    const db = new Database(":memory:");
    const repo = new SQLiteRepository(db);

    const startTime = new Date("2026-07-06T12:00:00.000Z");
    const world = new WorldState("world-xyz", startTime);
    const alice = new Entity("alice", "room-1");
    world.addEntity(alice);
    repo.saveWorldState(world);

    // Sequence of 2 intents:
    // 1. Invalid action: trying to unlock gate with wrong key
    // 2. Valid dialogue: speaking to bob
    const intent1 = {
      type: "action" as const,
      originalText: "She tries to unlock the gate with a hairpin.",
      description: "Alice attempts to pick the lock with a hairpin.",
      selfDescription: "You attempt to pick the lock with a hairpin.",
      actorId: "alice",
      targetIds: [],
      modifiers: [],
    };

    const intent2 = {
      type: "dialogue" as const,
      originalText: '"This is useless," she mutters.',
      description: "Alice mutters to herself.",
      selfDescription: "You mutter to yourself.",
      actorId: "alice",
      targetIds: [],
      modifiers: [],
    };

    // LLM validation / time delta mock responses:
    // For intent1 (action):
    const mockActionValidation = {
      isValid: false,
      reason: "Hairpins cannot pick high-security locks.",
    };
    // For intent2 (dialogue):
    const mockDialogueValidation = {
      isValid: true,
      reason: "Alice is free to talk.",
    };

    const llmProvider = new MockLLMProvider([
      mockActionValidation, // Used by Architect.validateIntent (Action)
      mockDialogueValidation, // Used by Architect.validateIntent (Dialogue)
    ]);

    const architect = new Architect(llmProvider, repo);

    // Process intent 1 (Invalid)
    const result1 = await architect.processIntent(world, intent1);
    expect(result1.isValid).toBe(false);
    expect(result1.reason).toBe("Hairpins cannot pick high-security locks.");
    expect(result1.timeDelta).toBeUndefined();

    // Verify clock did NOT advance
    expect(world.clock.get().toISOString()).toBe(startTime.toISOString());

    // Process intent 2 (Valid)
    const result2 = await architect.processIntent(world, intent2);
    expect(result2.isValid).toBe(true);
    expect(result2.timeDelta!.minutesToAdvance).toBe(1);

    // Verify clock advanced by 1 minute
    const expectedTime = new Date(startTime.getTime() + 1 * 60_000);
    expect(world.clock.get().toISOString()).toBe(expectedTime.toISOString());

    // Verify persisted clock
    const reloaded = repo.loadWorldState("world-xyz")!;
    expect(reloaded.clock.get().toISOString()).toBe(expectedTime.toISOString());

    db.close();
  });
});
