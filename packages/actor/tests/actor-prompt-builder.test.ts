import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { WorldState, Entity } from "@omnia/core";
import { BufferRepository, LedgerRepository } from "@omnia/memory";
import { ActorPromptBuilder } from "../src/actor-prompt-builder";

describe("ActorPromptBuilder with Long-Term Memory Integration", () => {
  let db: Database.Database;
  let bufferRepo: BufferRepository;
  let ledgerRepo: LedgerRepository;

  beforeEach(() => {
    db = new Database(":memory:");

    // Core database schemas for testing
    db.exec(`
      CREATE TABLE objects (
        id TEXT PRIMARY KEY
      );
    `);

    db.exec(`
      INSERT INTO objects (id) VALUES ('alice'), ('bob'), ('charlie');
    `);

    bufferRepo = new BufferRepository(db);
    ledgerRepo = new LedgerRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should inject both recent memory and recalled long-term memory with subjective aliases resolved", () => {
    const world = new WorldState(
      "world-123",
      new Date("2024-01-10T12:00:00.000Z"),
    );

    const alice = new Entity("alice", "tavern");
    // Add subjective alias for bob
    alice.aliases.set("bob", "Strider");
    world.addEntity(alice);

    const bob = new Entity("bob", "tavern");
    world.addEntity(bob);

    // 1. Populate recent buffer memory
    bufferRepo.save({
      id: "buf1",
      ownerId: "alice",
      timestamp: "2024-01-10T11:58:00.000Z", // 2 mins ago
      locationId: "tavern",
      intent: {
        type: "dialogue",
        actorId: "alice",
        targetIds: ["bob"],
        originalText: "Hello there",
        description: "Alice greets Bob",
      },
    });

    // 2. Populate ledger repository (long-term memory)
    ledgerRepo.save({
      id: "ledger1",
      ownerId: "alice",
      timestamp: "2024-01-08T12:00:00.000Z", // 2 days ago
      locationId: "tavern",
      involvedEntityIds: ["bob"],
      content: "alice met bob at the tavern.",
      quotes: ["I am a ranger."],
      importance: 9,
      embedding: [],
    });

    const builder = new ActorPromptBuilder(bufferRepo, ledgerRepo, 20, 5);
    const { userContext } = builder.build(world, alice);

    // Check recent memory exists
    expect(userContext).toContain("=== RECENT EVENTS ===");
    expect(userContext).toContain("Alice greets Bob");

    // Check long-term memory exists
    expect(userContext).toContain("=== YOUR MEMORIES ===");
    // Bob should be resolved to Strider in the ledger content
    expect(userContext).toContain("alice met Strider at the tavern.");
    expect(userContext).toContain('Quote: "I am a ranger."');
  });

  it("should not explode if ledger contains no memories or is empty", () => {
    const world = new WorldState(
      "world-123",
      new Date("2024-01-10T12:00:00.000Z"),
    );
    const alice = new Entity("alice", "tavern");
    world.addEntity(alice);

    const builder = new ActorPromptBuilder(bufferRepo, ledgerRepo, 20, 5);
    const { userContext } = builder.build(world, alice);

    expect(userContext).toContain("=== RECENT EVENTS ===");
    expect(userContext).not.toContain("=== YOUR MEMORIES ===");
  });
});
