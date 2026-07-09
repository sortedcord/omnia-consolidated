import { WorldState, Entity, SQLiteRepository, AttributeVisibility } from "@omnia/core";
import { Location } from "@omnia/spatial";
import { BufferRepository } from "@omnia/memory";
import { ScenarioSchema, Scenario } from "./schema.js";

export class ScenarioLoader {
  constructor(
    private coreRepo: SQLiteRepository,
    private bufferRepo: BufferRepository,
  ) {}

  /**
   * Instantiates a live world from a static JSON scenario template.
   * Creates a new world instance in the database using a generated unique World ID.
   *
   * @param scenarioJson The raw JSON scenario template contents.
   * @param targetWorldId The unique ID for the running instance to create (e.g. UUID).
   *                      Allows launching multiple active runs from one scenario.
   */
  async initializeWorld(scenarioJson: unknown, targetWorldId: string): Promise<string> {
    // 1. Validate scenario template schema
    const scenario: Scenario = ScenarioSchema.parse(scenarioJson);

    // 2. Instantiate running WorldState using the target instance ID
    const world = new WorldState(targetWorldId, new Date(scenario.startTime));
    
    // Seed world-level attributes as system-only (private, empty ACL)
    world.addAttribute("name", scenario.name, AttributeVisibility.PRIVATE, new Set());
    world.addAttribute("description", scenario.description, AttributeVisibility.PRIVATE, new Set());
    
    if (scenario.world?.attributes) {
      for (const attr of scenario.world.attributes) {
        const vis = attr.visibility === "PUBLIC" ? AttributeVisibility.PUBLIC : AttributeVisibility.PRIVATE;
        world.addAttribute(
          attr.name, 
          attr.value, 
          vis, 
          attr.allowedEntities ? new Set(attr.allowedEntities) : null,
        );
      }
    }

    // 3. Save World State core row
    this.coreRepo.saveWorldState(world);

    // 4. Instantiate and Persist Locations
    if (scenario.locations) {
      for (const locData of scenario.locations) {
        const location = new Location(locData.id, locData.parentId ?? null);
        
        if (locData.attributes) {
          for (const attr of locData.attributes) {
            const vis = attr.visibility === "PUBLIC" ? AttributeVisibility.PUBLIC : AttributeVisibility.PRIVATE;
            location.addAttribute(
              attr.name,
              attr.value,
              vis,
              attr.allowedEntities ? new Set(attr.allowedEntities) : null,
            );
          }
        }

        if (locData.connections) {
          location.connections = locData.connections.map((c) => ({
            targetId: c.targetId,
            portalName: c.portalName,
            portalStateDescriptor: c.portalStateDescriptor,
            visionProp: c.visionProp,
            soundProp: c.soundProp,
            bidirectional: c.bidirectional,
          }));
        }

        // Save location record linked to the world instance
        world.addLocation(location);
        this.coreRepo.saveLocation(location, world.id);
      }
    }

    // 5. Instantiate and Persist Entities (with Aliases & Memory Buffers)
    if (scenario.entities) {
      for (const entData of scenario.entities) {
        const entity = new Entity(entData.id, entData.locationId ?? null);
        
        // Load attributes
        if (entData.attributes) {
          for (const attr of entData.attributes) {
            const vis = attr.visibility === "PUBLIC" ? AttributeVisibility.PUBLIC : AttributeVisibility.PRIVATE;
            entity.addAttribute(
              attr.name,
              attr.value,
              vis,
              attr.allowedEntities ? new Set(attr.allowedEntities) : null,
            );
          }
        }

        // Load aliases
        if (entData.aliases) {
          for (const [targetId, alias] of Object.entries(entData.aliases)) {
            entity.aliases.set(targetId, alias);
          }
        }

        // Save entity record linked to the world instance
        world.addEntity(entity);
        this.coreRepo.saveEntity(entity, world.id);

        // Seed initial memory buffer history
        if (entData.initialMemories) {
          for (const mem of entData.initialMemories) {
            this.bufferRepo.save({
              id: mem.id,
              ownerId: entData.id,
              timestamp: mem.timestamp,
              locationId: mem.locationId,
              intent: mem.intent,
              outcome: mem.outcome,
            });
          }
        }
      }
    }

    return world.id;
  }
}
