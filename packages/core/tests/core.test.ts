import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import {
  Attribute,
  AttributeVisibility,
  AttributableObject,
  Entity,
  WorldClock,
  WorldState,
  SQLiteRepository,
} from "@omnia/core";

// A concrete implementation of AttributableObject for testing
class MockAttributable extends AttributableObject {}

describe("Attribute & AttributableObject Unit Tests (Tier 1)", () => {
  test("Attribute basic properties and access control", () => {
    const attr = new Attribute("health", "100", AttributeVisibility.PRIVATE);
    expect(attr.name).toBe("health");
    expect(attr.getValue()).toBe("100");
    expect(attr.visibility).toBe(AttributeVisibility.PRIVATE);

    // Public viewer should not have access to private attribute
    expect(attr.hasAccess("viewer1")).toBe(false);

    // Grant access and check again
    attr.grantAccess("viewer1");
    expect(attr.hasAccess("viewer1")).toBe(true);
    expect(attr.getAllowedEntities()).toContain("viewer1");

    // Revoke access
    attr.revokeAccess("viewer1");
    expect(attr.hasAccess("viewer1")).toBe(false);
  });

  test("AttributableObject attribute management", () => {
    const obj = new MockAttributable("obj-1");
    expect(obj.id).toBe("obj-1");

    // Add attribute
    obj.addAttribute("name", "John Doe", AttributeVisibility.PUBLIC);
    expect(obj.attributes.has("name")).toBe(true);

    // Duplicate attribute should throw
    expect(() => {
      obj.addAttribute("name", "Jane Doe", AttributeVisibility.PUBLIC);
    }).toThrow("Attribute name already exists");

    // Remove attribute
    obj.removeAttribute("name");
    expect(obj.attributes.has("name")).toBe(false);

    // Remove non-existent should throw
    expect(() => {
      obj.removeAttribute("name");
    }).toThrow("Attribute name does not exist");
  });

  test("AttributableObject visibility filtering", () => {
    const actor = new MockAttributable("actor");
    actor.addAttribute("eyes", "blue", AttributeVisibility.PUBLIC);
    actor.addAttribute("secret", "42", AttributeVisibility.PRIVATE, new Set(["friend"]));

    // Public viewer should only see public attributes
    const publicAttrs = actor.getVisibleAttributesFor("stranger");
    expect(publicAttrs.map(a => a.name)).toEqual(["eyes"]);

    // Authorized viewer should see both
    const privateAttrs = actor.getVisibleAttributesFor("friend");
    expect(privateAttrs.map(a => a.name)).toContain("eyes");
    expect(privateAttrs.map(a => a.name)).toContain("secret");
  });
});

describe("WorldClock Unit Tests (Tier 1)", () => {
  test("Default constructor values", () => {
    const clock = new WorldClock();
    // Default is 1999-05-14 18:00
    const expected = new Date(1999, 4, 14, 18, 0);
    expect(clock.get().getTime()).toBe(expected.getTime());
  });

  test("Explicit constructor values", () => {
    const date = new Date(2026, 0, 1, 12, 0);
    const clock = new WorldClock(date);
    expect(clock.get().getTime()).toBe(date.getTime());
  });

  test("Advance clock time", () => {
    const start = new Date(2026, 0, 1, 12, 0);
    const clock = new WorldClock(start);
    clock.advance(15); // Advance 15 minutes
    expect(clock.get().getTime()).toBe(start.getTime() + 15 * 60_000);
  });

  test("Reconstitute from ISO string", () => {
    const iso = "2026-07-06T09:40:00.000Z";
    const clock = WorldClock.fromISOString(iso);
    expect(clock.get().toISOString()).toBe(iso);
  });
});

describe("WorldState Unit Tests (Tier 1)", () => {
  test("WorldState entity registry", () => {
    const world = new WorldState("world-1");
    const entity = new Entity("ent-1");

    world.addEntity(entity);
    expect(world.getEntity("ent-1")).toBe(entity);

    // Duplicate entity should throw
    expect(() => {
      world.addEntity(entity);
    }).toThrow("Entity with ID ent-1 already exists in the world");
  });
});

describe("SQLiteRepository Unit Tests (Tier 1)", () => {
  test("Save and load world state with attributes, entities, clock, and ACLs", () => {
    const db = new Database(":memory:");
    const repo = new SQLiteRepository(db);

    // 1. Setup a WorldState with a custom clock
    const testDate = new Date("2026-07-06T09:45:00.000Z");
    const world = new WorldState("world-xyz", testDate);
    world.addAttribute("location", "Outer Rim", AttributeVisibility.PUBLIC);

    // 2. Setup Entities and add attributes with ACL grants
    const alice = new Entity("alice");
    alice.addAttribute("name", "Alice Smith", AttributeVisibility.PUBLIC);
    // Secret attribute visible only to 'bob'
    alice.addAttribute("diaries", "Private thoughts", AttributeVisibility.PRIVATE, new Set(["bob"]));
    world.addEntity(alice);

    const bob = new Entity("bob");
    bob.addAttribute("name", "Bob Jones", AttributeVisibility.PUBLIC);
    world.addEntity(bob);

    // 3. Save to in-memory repository
    repo.saveWorldState(world);

    // 4. Load from in-memory repository
    const loaded = repo.loadWorldState("world-xyz");
    expect(loaded).not.toBeNull();
    const worldState = loaded!;

    // 5. Assert WorldState properties
    expect(worldState.id).toBe("world-xyz");
    expect(worldState.clock.get().toISOString()).toBe(testDate.toISOString());
    expect(worldState.attributes.get("location")?.getValue()).toBe("Outer Rim");

    // 6. Assert loaded entities are present
    const loadedAlice = worldState.getEntity("alice");
    const loadedBob = worldState.getEntity("bob");
    expect(loadedAlice).toBeDefined();
    expect(loadedBob).toBeDefined();

    // 7. Assert entity attributes and access controls are preserved
    expect(loadedAlice!.attributes.get("name")?.getValue()).toBe("Alice Smith");
    expect(loadedAlice!.attributes.get("name")?.visibility).toBe(AttributeVisibility.PUBLIC);

    const diaryAttr = loadedAlice!.attributes.get("diaries")!;
    expect(diaryAttr.getValue()).toBe("Private thoughts");
    expect(diaryAttr.visibility).toBe(AttributeVisibility.PRIVATE);
    expect(diaryAttr.hasAccess("bob")).toBe(true);
    expect(diaryAttr.hasAccess("charlie")).toBe(false);

    db.close();
  });
});
