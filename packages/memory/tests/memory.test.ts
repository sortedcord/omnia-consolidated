import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import { Entity, SQLiteRepository } from "@omnia/core";
import { Intent } from "@omnia/intent";
import {
  BufferEntry,
  BufferRepository,
  serializeSubjectiveBufferEntry,
  resolveAlias,
} from "@omnia/memory";

describe("Subjective Buffer Entry Serializer Tests (Tier 1)", () => {
  test("resolveAlias correctly handles self and fallbacks", () => {
    const viewer = new Entity("alice");
    viewer.aliases.set("bob", "the hooded figure");

    expect(resolveAlias(viewer, "alice")).toBe("you");
    expect(resolveAlias(viewer, "bob")).toBe("the hooded figure");
    expect(resolveAlias(viewer, "charlie")).toBe("an unfamiliar figure");
  });

  test("serializes dialogue intent substituting target/actor aliases", () => {
    const viewer = new Entity("alice");
    viewer.aliases.set("bob", "the hooded figure");
    viewer.aliases.set("charlie", "the bartender");

    const entry: BufferEntry = {
      id: "entry-1",
      ownerId: "alice",
      timestamp: "2026-07-07T12:00:00.000Z",
      locationId: "room-1",
      intent: {
        type: "dialogue",
        originalText: '"Hello there," Bob said to Charlie.',
        description: "says, 'Hello there' to the bartender",
        selfDescription: "You say, 'Hello there' to the bartender.",
        actorId: "bob",
        targetIds: ["charlie"],
        modifiers: [],
      },
    };

    const result = serializeSubjectiveBufferEntry(entry, viewer);
    expect(result).toBe(
      "The hooded figure says, 'Hello there' to the bartender",
    );
  });

  test("serializes action intent with outcome details", () => {
    const viewer = new Entity("alice");
    viewer.aliases.set("bob", "the hooded figure");

    const entry: BufferEntry = {
      id: "entry-2",
      ownerId: "alice",
      timestamp: "2026-07-07T12:05:00.000Z",
      locationId: "room-1",
      intent: {
        type: "action",
        originalText: "Bob tried to break the latch.",
        description: "attempts to break the lock latch",
        selfDescription: "You attempt to break the lock latch.",
        actorId: "bob",
        targetIds: [],
        modifiers: [],
      },
      outcome: {
        isValid: false,
        reason: "The lock is made of reinforced steel.",
      },
    };

    const result = serializeSubjectiveBufferEntry(entry, viewer);
    expect(result).toBe(
      "The hooded figure attempts to break the lock latch (Outcome: Failed - The lock is made of reinforced steel.)",
    );
  });

  test("serializes self-reference and unfamiliar actors", () => {
    const viewer = new Entity("alice");

    const entrySelf: BufferEntry = {
      id: "entry-self",
      ownerId: "alice",
      timestamp: "2026-07-07T12:10:00.000Z",
      locationId: "room-1",
      intent: {
        type: "action",
        originalText: "I opened the window.",
        description: "open the window",
        selfDescription: "You open the window.",
        actorId: "alice",
        targetIds: [],
        modifiers: [],
      },
    };

    const resultSelf = serializeSubjectiveBufferEntry(entrySelf, viewer);
    expect(resultSelf).toBe("You open the window.");

    const entryUnfamiliar: BufferEntry = {
      id: "entry-unfamiliar",
      ownerId: "alice",
      timestamp: "2026-07-07T12:15:00.000Z",
      locationId: "room-1",
      intent: {
        type: "action",
        originalText: "Someone knocked.",
        description: "knocks on the door",
        selfDescription: "You knock on the door.",
        actorId: "stranger-1",
        targetIds: [],
        modifiers: [],
      },
    };

    const resultUnfamiliar = serializeSubjectiveBufferEntry(
      entryUnfamiliar,
      viewer,
    );
    expect(resultUnfamiliar).toBe("An unfamiliar figure knocks on the door");
  });
});

describe("BufferRepository Persistence Tests (Tier 1)", () => {
  test("saves, loads, lists, and deletes buffer entries in SQLite database", () => {
    const db = new Database(":memory:");

    // We need SQLiteRepository to initialize the objects table because buffer_entries depends on objects(id) via FK
    const coreRepo = new SQLiteRepository(db);
    const repo = new BufferRepository(db);

    // Add owner entity to objects table
    const alice = new Entity("alice");
    coreRepo.saveEntity(alice);

    const intent: Intent = {
      type: "action",
      originalText: "Alice picked up a stick.",
      description: "Alice gathers a stick",
      selfDescription: "You gather a stick.",
      actorId: "alice",
      targetIds: [],
      modifiers: [],
    };

    const entry: BufferEntry = {
      id: "buf-1",
      ownerId: "alice",
      timestamp: "2026-07-07T14:30:00.000Z",
      locationId: "forest",
      intent,
      outcome: {
        isValid: true,
        reason: "There are many dry sticks on the ground.",
      },
    };

    // Save
    repo.save(entry);

    // Load
    const loaded = repo.load("buf-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("buf-1");
    expect(loaded!.ownerId).toBe("alice");
    expect(loaded!.timestamp).toBe("2026-07-07T14:30:00.000Z");
    expect(loaded!.locationId).toBe("forest");
    expect(loaded!.intent).toEqual(intent);
    expect(loaded!.outcome).toEqual(entry.outcome);

    // List
    const list = repo.listForOwner("alice");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("buf-1");

    // Delete
    repo.delete("buf-1");
    expect(repo.load("buf-1")).toBeNull();

    db.close();
  });

  test("cascades delete of buffer entries when owner entity is deleted", () => {
    const db = new Database(":memory:");
    const coreRepo = new SQLiteRepository(db);
    const repo = new BufferRepository(db);

    const alice = new Entity("alice");
    coreRepo.saveEntity(alice);

    const entry: BufferEntry = {
      id: "buf-1",
      ownerId: "alice",
      timestamp: "2026-07-07T14:30:00.000Z",
      locationId: "forest",
      intent: {
        type: "action",
        originalText: "Alice sneezed.",
        description: "Alice sneezes",
        actorId: "alice",
        targetIds: [],
      },
    };

    repo.save(entry);
    expect(repo.load("buf-1")).not.toBeNull();

    // Delete owner entity from core repository
    coreRepo.delete("alice");

    // Verify buffer entry was cascade deleted
    expect(repo.load("buf-1")).toBeNull();

    db.close();
  });
});
