import {
  AttributableObject,
  Attribute,
  serializeAttributes,
} from "./attribute.js";
import { Entity } from "./entity.js";
import { WorldClock } from "./clock.js";
import { resolveAlias } from "./alias.js";

export class WorldState extends AttributableObject {
  /**
   * WorldState is the live, evolving instance you get from loading a Scenario and playing it forward.
   * Universe's current state (distinct from how it started)
   */
  readonly entities: Map<string, Entity> = new Map();
  readonly locations: Map<string, AttributableObject> = new Map();
  readonly clock: WorldClock;

  constructor(id?: string, startTime?: Date) {
    super(id);
    this.clock = new WorldClock(startTime);
  }

  addEntity(entity: Entity): void {
    if (this.entities.has(entity.id)) {
      throw new Error(
        `Entity with ID ${entity.id} already exists in the world`,
      );
    }
    this.entities.set(entity.id, entity);
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  addLocation(location: AttributableObject): void {
    if (this.locations.has(location.id)) {
      throw new Error(
        `Location with ID ${location.id} already exists in the world`,
      );
    }
    this.locations.set(location.id, location);
  }

  getLocation(id: string): AttributableObject | undefined {
    return this.locations.get(id);
  }
}

/**
 * Objective world state serializer for system LLM tasks.
 * Bypasses epistemic privacy bounds for system/physics validation.
 */
export function serializeObjectiveWorldState(worldState: WorldState): string {
  const lines: string[] = [];

  // Serialize world attributes
  if (worldState.attributes.size > 0) {
    lines.push("World Attributes:");
    const worldAttrsStr = serializeAttributes(
      Array.from(worldState.attributes.values()),
    );
    lines.push(
      worldAttrsStr
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  }

  // Serialize locations and their attributes/portals
  lines.push("Locations:");
  if (worldState.locations.size > 0) {
    for (const loc of worldState.locations.values()) {
      lines.push(`  - Location [ID: ${loc.id}]:`);

      const parentId = (loc as { parentId?: string | null }).parentId;
      if (parentId) {
        lines.push(`      * Parent Location ID: ${parentId}`);
      }

      if (loc.attributes.size > 0) {
        const locAttrsStr = serializeAttributes(
          Array.from(loc.attributes.values()),
        );
        lines.push(
          locAttrsStr
            .split("\n")
            .map((l) => "      " + l)
            .join("\n"),
        );
      } else {
        lines.push("      * (No attributes)");
      }

      const connections = (loc as { connections?: unknown[] }).connections as
        | {
            targetId: string;
            portalName?: string;
            portalStateDescriptor?: string;
            visionProp: number;
            soundProp: number;
            bidirectional: boolean;
          }[]
        | undefined;

      if (connections && connections.length > 0) {
        lines.push("      * Connections:");
        for (const conn of connections) {
          const portalStr = conn.portalName
            ? ` via ${conn.portalName} (${conn.portalStateDescriptor || "normal"})`
            : "";
          lines.push(
            `          -> To: ${conn.targetId}${portalStr} (Vision: ${conn.visionProp}, Sound: ${conn.soundProp})`,
          );
        }
      }
    }
  } else {
    lines.push("  (No locations)");
  }

  // Serialize entities and their attributes
  lines.push("Entities:");
  if (worldState.entities.size > 0) {
    for (const entity of worldState.entities.values()) {
      lines.push(`  - Entity [ID: ${entity.id}]:`);
      if (entity.locationId) {
        lines.push(`      * Location ID: ${entity.locationId}`);
      }
      if (entity.attributes.size > 0) {
        const entityAttrsStr = serializeAttributes(
          Array.from(entity.attributes.values()),
        );
        lines.push(
          entityAttrsStr
            .split("\n")
            .map((l) => "      " + l)
            .join("\n"),
        );
      } else {
        lines.push("      * (No attributes)");
      }
    }
  } else {
    lines.push("  (No entities)");
  }

  return lines.join("\n");
}

/**
 * Serializes a single attribute the way a viewer perceives it — name and
 * value only, no visibility/ACL metadata (the viewer already sees only
 * what they're allowed to see).
 */
function serializeVisibleAttributes(attrs: Attribute[]): string {
  if (attrs.length === 0) return "(No perceivable attributes)";
  return attrs.map((a) => `* ${a.name}: ${a.getValue()}`).join("\n");
}

/**
 * Subjective world-state serializer for actor/agent prompts.
 *
 * Epistemic opposite of serializeObjectiveWorldState: renders the world
 * strictly as it appears to a given viewer entity. Only attributes the
 * viewer has access to (via Attribute.hasAccess) are shown; system UUIDs
 * are replaced by subjective aliases ("you", known names, or
 * "an unfamiliar figure"). Co-located entities (sharing the viewer's
 * locationId) are included; entities elsewhere are listed only as
 * presences (name/alias) without their attributes, since the viewer
 * cannot perceive them in detail without a location model.
 */
export function serializeSubjectiveWorldState(
  worldState: WorldState,
  viewerId: string,
): string {
  const viewer = worldState.getEntity(viewerId);
  if (!viewer) {
    return `(Viewer entity "${viewerId}" not found in world state.)`;
  }

  const lines: string[] = [];
  const viewerAlias = resolveAlias(viewer, viewerId);

  // --- World attributes (only those the viewer can see) ---
  const worldVisible = worldState.getVisibleAttributesFor(viewerId);
  if (worldVisible.length > 0) {
    lines.push("World (as you know it):");
    lines.push(
      serializeVisibleAttributes(worldVisible)
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  }

  // --- Self ---
  lines.push(`Self (${viewerAlias}):`);
  const selfVisible = viewer.getVisibleAttributesFor(viewerId);
  lines.push(
    serializeVisibleAttributes(selfVisible)
      .split("\n")
      .map((l) => "  " + l)
      .join("\n"),
  );

  // --- Location / perceived entities ---
  lines.push("What you perceive around you:");
  if (viewer.locationId) {
    lines.push(`  You are at location: ${viewer.locationId}`);
    const location = worldState.getLocation(viewer.locationId);
    if (location) {
      const locVisible = location.getVisibleAttributesFor(viewerId);
      if (locVisible.length > 0) {
        lines.push("    Location attributes:");
        lines.push(
          serializeVisibleAttributes(locVisible)
            .split("\n")
            .map((l) => "      " + l)
            .join("\n"),
        );
      }
    }
  } else {
    lines.push("  You are not located anywhere in particular.");
  }

  const coLocated: Entity[] = [];
  const elsewhere: Entity[] = [];
  for (const e of worldState.entities.values()) {
    if (e.id === viewerId) continue;
    if (e.locationId !== null && e.locationId === viewer.locationId) {
      coLocated.push(e);
    } else {
      elsewhere.push(e);
    }
  }

  if (coLocated.length > 0) {
    lines.push("  Entities present with you:");
    for (const e of coLocated) {
      const alias = resolveAlias(viewer, e.id);
      lines.push(`    - ${alias}:`);
      const eVisible = e.getVisibleAttributesFor(viewerId);
      lines.push(
        serializeVisibleAttributes(eVisible)
          .split("\n")
          .map((l) => "      " + l)
          .join("\n"),
      );
    }
  } else {
    lines.push("  You are alone here.");
  }

  if (elsewhere.length > 0) {
    lines.push("  Other presences you are aware of (elsewhere):");
    for (const e of elsewhere) {
      const alias = resolveAlias(viewer, e.id);
      lines.push(`    - ${alias} [elsewhere]`);
    }
  }

  return lines.join("\n");
}
