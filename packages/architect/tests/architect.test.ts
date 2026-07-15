import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import {
  WorldState,
  Entity,
  SQLiteRepository,
  AttributeVisibility,
} from "@omnia/core";
import { MockLLMProvider } from "@omnia/llm";
import { Architect, AliasDeltaGenerator } from "@omnia/architect";
import { Intent } from "@omnia/intent";

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

    const intent: Intent = {
      type: "action",
      originalText: "open the chest and read the scroll",
      description: "Open the chest and read the scroll",
      selfDescription: "You open the chest and read the scroll.",
      actorId: "alice",
      targetIds: [],
      modifiers: [],
    };

    const result = await architect.validateIntent(world, intent);

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

    const intent: Intent = {
      type: "action",
      originalText: "unlock the gate and escape",
      description: "Unlock the gate and escape",
      selfDescription: "You unlock the gate and escape.",
      actorId: "bob",
      targetIds: [],
      modifiers: [],
    };

    const result = await architect.validateIntent(world, intent);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Bob does not have the key to the iron gate.");
  });

  test("returns invalid response immediately if actor does not exist", async () => {
    const world = new WorldState("world-1");
    // No entities added

    const llmProvider = new MockLLMProvider([]); // No mock responses because it shouldn't be called
    const architect = new Architect(llmProvider);

    const intent: Intent = {
      type: "action",
      originalText: "haunt the mansion",
      description: "Haunt the mansion",
      selfDescription: "You haunt the mansion.",
      actorId: "ghost",
      targetIds: [],
      modifiers: [],
    };

    const result = await architect.validateIntent(world, intent);

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain(
      'Actor entity with ID "ghost" does not exist',
    );
  });
});

describe("TimeDeltaGenerator & Architect.processIntent Unit Tests (Tier 1)", () => {
  test("processIntent advances clock and saves state for a valid intent", async () => {
    const db = new Database(":memory:");
    const repo = new SQLiteRepository(db);

    const world = new WorldState(
      "world-xyz",
      new Date("2026-07-06T12:00:00.000Z"),
    );
    const alice = new Entity("alice");
    world.addEntity(alice);

    // Initial save so it exists in db
    repo.saveWorldState(world);

    // Setup mock LLM responses:
    // First call: validateIntent (ValidationResult)
    // Second call: TimeDeltaGenerator (TimeDelta)
    const mockValidation = {
      isValid: true,
      reason: "Alice has the lockpick kit and skill.",
    };
    const mockTimeDelta = {
      minutesToAdvance: 20,
      explanation: "Picking a lock takes time.",
    };
    const llmProvider = new MockLLMProvider([mockValidation, mockTimeDelta]);

    const architect = new Architect(llmProvider, repo);

    const intent: Intent = {
      type: "action",
      originalText: "pick the lock of the wooden chest",
      description: "Pick the lock of the wooden chest",
      selfDescription: "You pick the lock of the wooden chest.",
      actorId: "alice",
      targetIds: [],
      modifiers: [],
    };

    const result = await architect.processIntent(world, intent);

    // Assert results
    expect(result.isValid).toBe(true);
    expect(result.reason).toBe("Alice has the lockpick kit and skill.");
    expect(result.timeDelta).toBeDefined();
    expect(result.timeDelta!.minutesToAdvance).toBe(20);

    // Verify clock was advanced locally
    const expectedTime = new Date(
      new Date("2026-07-06T12:00:00.000Z").getTime() + 20 * 60_000,
    );
    expect(world.clock.get().toISOString()).toBe(expectedTime.toISOString());

    // Verify it was persisted to the database
    const loaded = repo.loadWorldState("world-xyz")!;
    expect(loaded.clock.get().toISOString()).toBe(expectedTime.toISOString());

    db.close();
  });

  test("processIntent does not advance clock or save state for an invalid intent", async () => {
    const db = new Database(":memory:");
    const repo = new SQLiteRepository(db);

    const startTime = new Date("2026-07-06T12:00:00.000Z");
    const world = new WorldState("world-xyz", startTime);
    const bob = new Entity("bob");
    world.addEntity(bob);
    repo.saveWorldState(world);

    const mockValidation = {
      isValid: false,
      reason: "Bob is bound by chains.",
    };
    const llmProvider = new MockLLMProvider([mockValidation]); // TimeDeltaGenerator shouldn't be called

    const architect = new Architect(llmProvider, repo);

    const intent: Intent = {
      type: "action",
      originalText: "run away",
      description: "Run away",
      selfDescription: "You run away.",
      actorId: "bob",
      targetIds: [],
      modifiers: [],
    };

    const result = await architect.processIntent(world, intent);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Bob is bound by chains.");
    expect(result.timeDelta).toBeUndefined();

    // Verify clock did not advance
    expect(world.clock.get().toISOString()).toBe(startTime.toISOString());

    // Verify database value remained unchanged
    const loaded = repo.loadWorldState("world-xyz")!;
    expect(loaded.clock.get().toISOString()).toBe(startTime.toISOString());

    db.close();
  });
});

describe("AliasDeltaGenerator Unit Tests (Tier 1)", () => {
  test("successfully generates descriptive alias based on visible attributes", async () => {
    const world = new WorldState("world-1");
    const viewer = new Entity("viewer-1");
    const target = new Entity("target-1");
    target.addAttribute(
      "appearance",
      "A tall elf with silver hair",
      AttributeVisibility.PUBLIC,
    );
    target.addAttribute(
      "clothing",
      "A green tunic",
      AttributeVisibility.PUBLIC,
    );
    world.addEntity(viewer);
    world.addEntity(target);

    const mockResponse = {
      alias: "the tall silver-haired elf in the green tunic",
    };
    const llmProvider = new MockLLMProvider([mockResponse]);
    const generator = new AliasDeltaGenerator(llmProvider);

    const result = await generator.generate(viewer, target);

    expect(result).toBe("the tall silver-haired elf in the green tunic");
  });
});
