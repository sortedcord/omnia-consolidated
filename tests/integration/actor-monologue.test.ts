import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import {
  WorldState,
  Entity,
  SQLiteRepository,
  AttributeVisibility,
} from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { IntentSequence } from "@omnia/intent";
import { Architect } from "@omnia/architect";
import { BufferRepository, BufferEntry } from "@omnia/memory";
import {
  ActorAgent,
  ActorResponseSchema,
  buildBufferEntryForIntent,
} from "@omnia/actor";

describe("Actor Agent + Monologue Intent Integration (Tier 2)", () => {
  test("actor produces prose → decoder splits into dialogue/action/monologue → architect bypasses monologue", async () => {
    const db = new Database(":memory:");
    const coreRepo = new SQLiteRepository(db);
    const bufferRepo = new BufferRepository(db);

    const startTime = new Date("2026-07-09T12:00:00.000Z");
    const world = new WorldState("world-actor", startTime);
    world.addAttribute("location", "Tavern Cellar", AttributeVisibility.PUBLIC);

    const alice = new Entity("alice", "cellar-1");
    alice.addAttribute("name", "Alice", AttributeVisibility.PUBLIC);
    alice.addAttribute("role", "rogue", AttributeVisibility.PUBLIC);
    // A private, self-visible attribute (explicitly ACL'd to self).
    alice.addAttribute(
      "secret_goal",
      "Steal the ledger without being noticed.",
      AttributeVisibility.PRIVATE,
      new Set(["alice"]),
    );
    world.addEntity(alice);

    const bob = new Entity("bob", "cellar-1");
    bob.addAttribute("name", "Bob", AttributeVisibility.PUBLIC);
    bob.addAttribute("role", "guard", AttributeVisibility.PUBLIC);
    world.addEntity(bob);

    // Alice knows Bob by name.
    alice.aliases.set("bob", "Bob");

    coreRepo.saveWorldState(world);

    // --- Mock LLM response queue ---
    // 1. Actor produces prose containing a thought, a spoken line, and an action.
    const mockActorProse = {
      narrativeProse:
        "I can't believe Bob hasn't noticed me yet, Alice thought. \"Hey Bob,\" she called out softly. She reached for the ledger on the table.",
    };

    // 2. IntentDecoder splits that prose into 3 intents.
    const mockDecodedSequence: IntentSequence = {
      intents: [
        {
          type: "monologue",
          originalText:
            "I can't believe Bob hasn't noticed me yet, Alice thought.",
          description:
            "Alice internally reflects that Bob has not noticed her.",
          selfDescription:
            "You internally reflect that Bob has not noticed you.",
          actorId: "alice",
          targetIds: [],
          modifiers: [],
        },
        {
          type: "dialogue",
          originalText: '"Hey Bob," she called out softly.',
          description: "Alice softly calls out to Bob.",
          selfDescription: "You softly call out to Bob.",
          actorId: "alice",
          targetIds: ["bob"],
          modifiers: [],
        },
        {
          type: "action",
          originalText: "She reached for the ledger on the table.",
          description: "Alice reaches for the ledger on the table.",
          selfDescription: "You reach for the ledger on the table.",
          actorId: "alice",
          targetIds: [],
          modifiers: [],
        },
      ],
    };

    // 3. Architect: dialogue is always valid (1 min), action is valid (2 min).
    //    NOTE: monologue never reaches the validator/delta generator.
    const mockDialogueValidation = {
      isValid: true,
      reason: "Alice can speak.",
    };
    const mockActionValidation = {
      isValid: true,
      reason: "The ledger is within reach.",
    };
    const mockActionTimeDelta = {
      minutesToAdvance: 2,
      explanation: "Reaching for the ledger takes 2 minutes.",
    };

    const llmProvider = new MockLLMProvider([
      mockActorProse, // 1. Actor generation
      mockDecodedSequence, // 2. IntentDecoder
      mockDialogueValidation, // 3. Architect.validateIntent (dialogue)
      mockActionValidation, // 4. Architect.validateIntent (action)
      mockActionTimeDelta, // 5. TimeDeltaGenerator (action)
    ]);

    const actor = new ActorAgent(llmProvider, bufferRepo);
    const architect = new Architect(llmProvider, coreRepo);

    // 1. Actor acts
    const turn = await actor.act(world, alice);

    expect(turn.narrativeProse).toBe(mockActorProse.narrativeProse);
    expect(turn.intents.intents).toHaveLength(3);
    expect(turn.intents.intents[0].type).toBe("monologue");
    expect(turn.intents.intents[1].type).toBe("dialogue");
    expect(turn.intents.intents[2].type).toBe("action");

    const intents = turn.intents.intents;
    const writtenEntries: BufferEntry[] = [];

    // 2. Process each intent through the Architect and write memory.
    for (const intent of intents) {
      const result = await architect.processIntent(world, intent);

      const entry = buildBufferEntryForIntent(
        intent,
        world.clock.get().toISOString(),
        alice.locationId,
      );

      // For action intents, attach the validation outcome.
      if (intent.type === "action") {
        entry.outcome = { isValid: result.isValid, reason: result.reason };
      }

      bufferRepo.save(entry);
      writtenEntries.push(entry);
    }

    // 3. Monologue bypassed validation: clock did NOT advance for it,
    //    and no outcome was attached to its buffer entry.
    expect(intents[0].type).toBe("monologue");
    expect(writtenEntries[0].outcome).toBeUndefined();

    // 4. Dialogue: valid, 1-minute delta, no outcome field.
    expect(writtenEntries[1].outcome).toBeUndefined();

    // 5. Action: valid, 2-minute delta, outcome attached.
    expect(writtenEntries[2].outcome).toEqual({
      isValid: true,
      reason: "The ledger is within reach.",
    });

    // 6. Clock advanced by exactly 3 minutes (dialogue 1 + action 2).
    const expectedTime = new Date(startTime.getTime() + 3 * 60_000);
    expect(world.clock.get().toISOString()).toBe(expectedTime.toISOString());

    // 7. All three intents persisted to Alice's memory buffer.
    const aliceMemory = bufferRepo.listForOwner("alice");
    expect(aliceMemory).toHaveLength(3);
    expect(aliceMemory[0].intent.type).toBe("monologue");
    expect(aliceMemory[1].intent.type).toBe("dialogue");
    expect(aliceMemory[2].intent.type).toBe("action");

    // 8. Monologue entry has no outcome; action entry does.
    expect(aliceMemory[0].outcome).toBeUndefined();
    expect(aliceMemory[2].outcome).toBeDefined();
    expect(aliceMemory[2].outcome!.isValid).toBe(true);

    // 9. Monologue did NOT touch persisted world clock (only the action did).
    const reloaded = coreRepo.loadWorldState("world-actor")!;
    expect(reloaded.clock.get().toISOString()).toBe(expectedTime.toISOString());

    db.close();
  });

  test("ActorResponseSchema validates prose output shape", () => {
    const valid = { narrativeProse: "Alice thought quietly." };
    expect(ActorResponseSchema.parse(valid)).toEqual(valid);

    expect(() => ActorResponseSchema.parse({})).toThrow();
    expect(() => ActorResponseSchema.parse({ narrativeProse: 123 })).toThrow();
  });

  test("serializeSubjectiveWorldState is epistemically bounded", async () => {
    const { serializeSubjectiveWorldState } = await import("@omnia/core");

    const world = new WorldState("world-subj");
    const alice = new Entity("alice", "room-1");
    alice.addAttribute("name", "Alice", AttributeVisibility.PUBLIC);
    alice.addAttribute(
      "secret",
      "hidden truth",
      AttributeVisibility.PRIVATE,
      new Set(["alice"]),
    );
    world.addEntity(alice);

    const bob = new Entity("bob", "room-1");
    bob.addAttribute("name", "Bob", AttributeVisibility.PUBLIC);
    bob.addAttribute(
      "bob_secret",
      "bob's hidden truth",
      AttributeVisibility.PRIVATE,
      new Set(["bob"]),
    );
    world.addEntity(bob);

    const view = serializeSubjectiveWorldState(world, "alice");

    // Alice sees her own secret (explicitly ACL'd).
    expect(view).toContain("secret: hidden truth");
    // Alice sees Bob's public name.
    expect(view).toContain("name: Bob");
    // Alice does NOT see Bob's private attribute.
    expect(view).not.toContain("bob's hidden truth");
    // Alice perceives herself as "you".
    expect(view).toContain("Self (you)");
    // Bob is an unfamiliar figure (no alias set).
    expect(view).toContain("an unfamiliar figure");
  });
});
