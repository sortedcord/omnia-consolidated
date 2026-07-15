import Database from "better-sqlite3";

import { AttributableObject, AttributeVisibility } from "./attribute.js";
import { Entity } from "./entity.js";
import { WorldState } from "./world.js";

class GenericObject extends AttributableObject {}

export class SQLiteRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    // Enable foreign keys for cascading deletes
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS objects (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        world_id TEXT,
        clock_iso TEXT,
        location_id TEXT,
        aliases_json TEXT,
        FOREIGN KEY (world_id) REFERENCES objects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attributes (
        object_id TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        visibility TEXT NOT NULL,
        PRIMARY KEY (object_id, name),
        FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attribute_acl (
        object_id TEXT NOT NULL,
        attribute_name TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (object_id, attribute_name, entity_id),
        FOREIGN KEY (object_id, attribute_name) REFERENCES attributes(object_id, name) ON DELETE CASCADE
      );
    `);

    // Safely add clock_iso column if it does not exist in an existing database
    try {
      this.db.exec("ALTER TABLE objects ADD COLUMN clock_iso TEXT;");
    } catch {
      // Column already exists, ignore error
    }

    // Safely add location_id column if it does not exist in an existing database
    try {
      this.db.exec("ALTER TABLE objects ADD COLUMN location_id TEXT;");
    } catch {
      // Column already exists, ignore error
    }

    // Safely add aliases_json column if it does not exist in an existing database
    try {
      this.db.exec("ALTER TABLE objects ADD COLUMN aliases_json TEXT;");
    } catch {
      // Column already exists, ignore error
    }

    // Safely add connections_json column if it does not exist in an existing database
    try {
      this.db.exec("ALTER TABLE objects ADD COLUMN connections_json TEXT;");
    } catch {
      // Column already exists, ignore error
    }

    // Safely add is_agent column if it does not exist in an existing database
    try {
      this.db.exec("ALTER TABLE objects ADD COLUMN is_agent INTEGER;");
    } catch {
      // Column already exists, ignore error
    }
  }

  save(obj: AttributableObject, type: string, worldId?: string): void {
    const saveTx = this.db.transaction(() => {
      let clockIso: string | null = null;
      if (obj instanceof WorldState) {
        clockIso = obj.clock.get().toISOString();
      }

      let locationId: string | null = null;
      let aliasesJson: string | null = null;
      let connectionsJson: string | null = null;
      let isAgent: number | null = null;

      if (obj instanceof Entity) {
        locationId = obj.locationId;
        aliasesJson = JSON.stringify(Array.from(obj.aliases.entries()));
        isAgent = obj.isAgent ? 1 : 0;
      }

      // Check if it's a location (using duck typing to avoid circular import of Location)
      if (type === "location") {
        const loc = obj as {
          parentId?: string | null;
          connections?: unknown[];
        };
        locationId = loc.parentId ?? null;
        if (loc.connections) {
          connectionsJson = JSON.stringify(loc.connections);
        }
      }

      // 1. Insert or ignore the object in the objects table
      this.db
        .prepare(
          `
        INSERT INTO objects (id, type, world_id, clock_iso, location_id, aliases_json, connections_json, is_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          type = excluded.type, 
          world_id = excluded.world_id,
          clock_iso = excluded.clock_iso,
          location_id = excluded.location_id,
          aliases_json = excluded.aliases_json,
          connections_json = excluded.connections_json,
          is_agent = excluded.is_agent
      `,
        )
        .run(
          obj.id,
          type,
          worldId || null,
          clockIso,
          locationId,
          aliasesJson,
          connectionsJson,
          isAgent,
        );

      // Get current attributes from db to delete the ones that are no longer present
      const existingAttrs = this.db
        .prepare(
          `
        SELECT name FROM attributes WHERE object_id = ?
      `,
        )
        .all(obj.id) as { name: string }[];

      const existingNames = new Set(existingAttrs.map((a) => a.name));
      const currentNames = new Set(obj.attributes.keys());

      // Delete attributes that are no longer on the object
      for (const name of existingNames) {
        if (!currentNames.has(name)) {
          this.db
            .prepare(
              `
            DELETE FROM attributes WHERE object_id = ? AND name = ?
          `,
            )
            .run(obj.id, name);
        }
      }

      // Save / update current attributes
      for (const [name, attr] of obj.attributes) {
        this.db
          .prepare(
            `
          INSERT INTO attributes (object_id, name, value, visibility)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(object_id, name) DO UPDATE SET
            value = excluded.value,
            visibility = excluded.visibility
        `,
          )
          .run(obj.id, name, attr.getValue(), attr.getVisibility());

        // Manage ACL
        // Clear existing ACL entries for this attribute
        this.db
          .prepare(
            `
          DELETE FROM attribute_acl WHERE object_id = ? AND attribute_name = ?
        `,
          )
          .run(obj.id, name);

        // Insert new ACL entries
        if (attr.getVisibility() === AttributeVisibility.PRIVATE) {
          const allowed = attr.getAllowedEntities();
          const insertAcl = this.db.prepare(`
            INSERT INTO attribute_acl (object_id, attribute_name, entity_id)
            VALUES (?, ?, ?)
          `);
          for (const entityId of allowed) {
            insertAcl.run(obj.id, name, entityId);
          }
        }
      }
    });

    saveTx();
  }

  saveEntity(entity: Entity, worldId?: string): void {
    this.save(entity, "entity", worldId);
  }

  saveLocation(location: AttributableObject, worldId?: string): void {
    this.save(location, "location", worldId);
  }

  saveWorldState(worldState: WorldState): void {
    const saveWorldTx = this.db.transaction(() => {
      this.save(worldState, "world");
      for (const entity of worldState.entities.values()) {
        this.saveEntity(entity, worldState.id);
      }
      for (const location of worldState.locations.values()) {
        this.saveLocation(location, worldState.id);
      }
    });
    saveWorldTx();
  }

  loadEntity(id: string): Entity | null {
    const objRow = this.db
      .prepare(
        `
      SELECT type, location_id, aliases_json, is_agent FROM objects WHERE id = ?
    `,
      )
      .get(id) as
      | {
          type: string;
          location_id: string | null;
          aliases_json: string | null;
          is_agent: number | null;
        }
      | undefined;

    if (!objRow || objRow.type !== "entity") {
      return null;
    }

    const entity = new Entity(
      id,
      objRow.location_id,
      objRow.is_agent !== null ? objRow.is_agent === 1 : true,
    );
    if (objRow.aliases_json) {
      const entries = JSON.parse(objRow.aliases_json) as [string, string][];
      for (const [k, v] of entries) {
        entity.aliases.set(k, v);
      }
    }
    this.reconstituteAttributes(entity);
    return entity;
  }

  loadLocation<T extends AttributableObject>(
    id: string,
    factory: (id: string, parentId: string | null) => T,
  ): T | null {
    const objRow = this.db
      .prepare(
        `
      SELECT type, location_id, connections_json FROM objects WHERE id = ?
    `,
      )
      .get(id) as
      | {
          type: string;
          location_id: string | null;
          connections_json: string | null;
        }
      | undefined;

    if (!objRow || objRow.type !== "location") {
      return null;
    }

    const location = factory(id, objRow.location_id);
    if (objRow.connections_json) {
      (location as { connections?: unknown[] }).connections = JSON.parse(
        objRow.connections_json,
      );
    }
    this.reconstituteAttributes(location);
    return location;
  }

  listLocations<T extends AttributableObject>(
    worldId: string,
    factory: (id: string, parentId: string | null) => T,
  ): T[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, location_id, connections_json FROM objects WHERE type = 'location' AND world_id = ?
    `,
      )
      .all(worldId) as {
      id: string;
      location_id: string | null;
      connections_json: string | null;
    }[];

    const locations: T[] = [];
    for (const row of rows) {
      const loc = factory(row.id, row.location_id);
      if (row.connections_json) {
        (loc as { connections?: unknown[] }).connections = JSON.parse(
          row.connections_json,
        );
      }
      this.reconstituteAttributes(loc);
      locations.push(loc);
    }
    return locations;
  }

  loadWorldState(id: string): WorldState | null {
    const objRow = this.db
      .prepare(
        `
      SELECT type, clock_iso FROM objects WHERE id = ?
    `,
      )
      .get(id) as { type: string; clock_iso: string | null } | undefined;

    if (!objRow || objRow.type !== "world") {
      return null;
    }

    const startTime = objRow.clock_iso ? new Date(objRow.clock_iso) : undefined;
    const worldState = new WorldState(id, startTime);
    this.reconstituteAttributes(worldState);

    // Reconstitute all locations belonging to this world
    const locationRows = this.db
      .prepare(
        `
      SELECT id, location_id, connections_json FROM objects WHERE type = 'location' AND world_id = ?
    `,
      )
      .all(id) as {
      id: string;
      location_id: string | null;
      connections_json: string | null;
    }[];

    for (const row of locationRows) {
      const loc = new GenericObject(row.id);
      (loc as { parentId?: string | null }).parentId = row.location_id;
      if (row.connections_json) {
        (loc as { connections?: unknown[] }).connections = JSON.parse(
          row.connections_json,
        );
      }
      this.reconstituteAttributes(loc);
      worldState.addLocation(loc);
    }

    // Reconstitute all entities belonging to this world
    const entityRows = this.db
      .prepare(
        `
      SELECT id, location_id, aliases_json, is_agent FROM objects WHERE type = 'entity' AND world_id = ?
    `,
      )
      .all(id) as {
      id: string;
      location_id: string | null;
      aliases_json: string | null;
      is_agent: number | null;
    }[];

    for (const row of entityRows) {
      const entity = new Entity(
        row.id,
        row.location_id,
        row.is_agent !== null ? row.is_agent === 1 : true,
      );
      if (row.aliases_json) {
        const entries = JSON.parse(row.aliases_json) as [string, string][];
        for (const [k, v] of entries) {
          entity.aliases.set(k, v);
        }
      }
      this.reconstituteAttributes(entity);
      worldState.addEntity(entity);
    }

    return worldState;
  }

  listEntities(): Entity[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, aliases_json, is_agent FROM objects WHERE type = 'entity'
    `,
      )
      .all() as {
      id: string;
      aliases_json: string | null;
      is_agent: number | null;
    }[];

    const entities: Entity[] = [];
    for (const row of rows) {
      const entity = new Entity(
        row.id,
        null,
        row.is_agent !== null ? row.is_agent === 1 : true,
      );
      if (row.aliases_json) {
        const entries = JSON.parse(row.aliases_json) as [string, string][];
        for (const [k, v] of entries) {
          entity.aliases.set(k, v);
        }
      }
      this.reconstituteAttributes(entity);
      entities.push(entity);
    }
    return entities;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM objects WHERE id = ?`).run(id);
  }

  private reconstituteAttributes(obj: AttributableObject): void {
    // Clear the auto-generated empty maps/attributes if any
    obj.attributes.clear();

    const attrs = this.db
      .prepare(
        `
      SELECT name, value, visibility FROM attributes WHERE object_id = ?
    `,
      )
      .all(obj.id) as {
      name: string;
      value: string;
      visibility: AttributeVisibility;
    }[];

    for (const attrRow of attrs) {
      const allowedRows = this.db
        .prepare(
          `
        SELECT entity_id FROM attribute_acl WHERE object_id = ? AND attribute_name = ?
      `,
        )
        .all(obj.id, attrRow.name) as { entity_id: string }[];

      const allowedEntities = new Set(allowedRows.map((r) => r.entity_id));
      obj.addAttribute(
        attrRow.name,
        attrRow.value,
        attrRow.visibility,
        allowedEntities,
      );
    }
  }
}
