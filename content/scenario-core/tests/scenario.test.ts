import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import { SQLiteRepository } from "@omnia/core";
import { Location } from "@omnia/spatial";
import { BufferRepository } from "@omnia/memory";
import { ScenarioLoader, ScenarioSchema } from "../src/index.js";

describe("Scenario Validation & Schema Tests (Tier 1)", () => {
  const validScenario = {
    id: "sc-haunted-house",
    name: "Haunted House Mystery",
    description: "A spooky old manor.",
    startTime: "2026-07-09T08:00:00.000Z",
    world: {
      attributes: [
        { name: "weather", value: "stormy", visibility: "PUBLIC" },
      ],
    },
    locations: [
      {
        id: "lobby",
        parentId: null,
        attributes: [
          { name: "light", value: "dim", visibility: "PUBLIC" },
        ],
        connections: [
          {
            targetId: "kitchen",
            portalName: "swinging door",
            visionProp: 2,
            soundProp: 6,
            bidirectional: true,
          },
        ],
      },
      {
        id: "kitchen",
        parentId: "lobby",
      },
    ],
    entities: [
      {
        id: "investigator",
        locationId: "lobby",
        attributes: [
          { name: "sanity", value: "100", visibility: "PRIVATE", allowedEntities: ["investigator"] },
        ],
        aliases: {
          ghost: "shadowy specter",
        },
        initialMemories: [
          {
            id: "mem-seed-1",
            timestamp: "2026-07-09T07:55:00.000Z",
            locationId: "lobby",
            intent: {
              type: "action",
              originalText: "I entered the foyer.",
              description: "entered the house",
              actorId: "investigator",
              targetIds: [],
            },
          },
        ],
      },
    ],
  };

  test("successfully validates a valid scenario JSON template", () => {
    const result = ScenarioSchema.safeParse(validScenario);
    expect(result.success).toBe(true);
  });

  test("fails validation on invalid scenario structure", () => {
    const invalidScenario = {
      id: "sc-bad",
      name: "Missing critical fields",
      // description and startTime are missing
    };
    const result = ScenarioSchema.safeParse(invalidScenario);
    expect(result.success).toBe(false);
  });

  test("loads scenario into SQLite database and reconstitutes all objects correctly", async () => {
    const db = new Database(":memory:");
    const coreRepo = new SQLiteRepository(db);
    const bufferRepo = new BufferRepository(db);
    const loader = new ScenarioLoader(coreRepo, bufferRepo);

    const targetWorldId = "active-world-run-1";
    const worldId = await loader.initializeWorld(validScenario, targetWorldId);
    expect(worldId).toBe(targetWorldId);

    // 1. Verify WorldState loaded
    const world = coreRepo.loadWorldState(targetWorldId);
    expect(world).not.toBeNull();
    expect(world!.id).toBe(targetWorldId);
    expect(world!.clock.get().toISOString()).toBe("2026-07-09T08:00:00.000Z");
    expect(world!.attributes.get("name")?.getValue()).toBe("Haunted House Mystery");
    expect(world!.attributes.get("weather")?.getValue()).toBe("stormy");

    // 2. Verify Locations loaded with connections & hierarchy
    const locations = coreRepo.listLocations(targetWorldId, (id, parentId) => new Location(id, parentId));
    expect(locations).toHaveLength(2);

    const lobby = locations.find((l) => l.id === "lobby");
    expect(lobby).toBeDefined();
    expect(lobby!.parentId).toBeNull();
    expect(lobby!.attributes.get("light")?.getValue()).toBe("dim");
    expect(lobby!.connections).toHaveLength(1);
    expect(lobby!.connections[0].targetId).toBe("kitchen");
    expect(lobby!.connections[0].portalName).toBe("swinging door");
    expect(lobby!.connections[0].visionProp).toBe(2);

    const kitchen = locations.find((l) => l.id === "kitchen");
    expect(kitchen).toBeDefined();
    expect(kitchen!.parentId).toBe("lobby");

    // 3. Verify Entities loaded with subjective alias map
    const loadedInvestigator = world!.getEntity("investigator");
    expect(loadedInvestigator).toBeDefined();
    expect(loadedInvestigator!.locationId).toBe("lobby");
    expect(loadedInvestigator!.attributes.get("sanity")?.getValue()).toBe("100");
    expect(loadedInvestigator!.aliases.get("ghost")).toBe("shadowy specter");

    // 4. Verify pre-seeded memories loaded in BufferRepository
    const memories = bufferRepo.listForOwner("investigator");
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe("mem-seed-1");
    expect(memories[0].timestamp).toBe("2026-07-09T07:55:00.000Z");
    expect(memories[0].locationId).toBe("lobby");
    expect(memories[0].intent.description).toBe("entered the house");

    db.close();
  });
});
