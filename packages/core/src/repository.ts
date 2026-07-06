import Database from "better-sqlite3";

import { AttributableObject, AttributeVisibility } from "./attribute.js";
import { Entity } from "./entity.js";
import { WorldState } from "./world.js";

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
  }

  save(obj: AttributableObject, type: string, worldId?: string): void {
    const saveTx = this.db.transaction(() => {
      let clockIso: string | null = null;
      if (obj instanceof WorldState) {
        clockIso = obj.clock.get().toISOString();
      }

      let locationId: string | null = null;
      if (obj instanceof Entity) {
        locationId = obj.locationId;
      }

      // 1. Insert or ignore the object in the objects table
      this.db
        .prepare(
          `
        INSERT INTO objects (id, type, world_id, clock_iso, location_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          type = excluded.type, 
          world_id = excluded.world_id,
          clock_iso = excluded.clock_iso,
          location_id = excluded.location_id
      `,
        )
        .run(obj.id, type, worldId || null, clockIso, locationId);

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

  saveWorldState(worldState: WorldState): void {
    const saveWorldTx = this.db.transaction(() => {
      this.save(worldState, "world");
      for (const entity of worldState.entities.values()) {
        this.saveEntity(entity, worldState.id);
      }
    });
    saveWorldTx();
  }

  loadEntity(id: string): Entity | null {
    const objRow = this.db
      .prepare(
        `
      SELECT type, location_id FROM objects WHERE id = ?
    `,
      )
      .get(id) as { type: string; location_id: string | null } | undefined;

    if (!objRow || objRow.type !== "entity") {
      return null;
    }

    const entity = new Entity(id, objRow.location_id);
    this.reconstituteAttributes(entity);
    return entity;
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

    // Reconstitute all entities belonging to this world
    const entityRows = this.db
      .prepare(
        `
      SELECT id, location_id FROM objects WHERE type = 'entity' AND world_id = ?
    `,
      )
      .all(id) as { id: string; location_id: string | null }[];

    for (const row of entityRows) {
      const entity = new Entity(row.id, row.location_id);
      this.reconstituteAttributes(entity);
      worldState.addEntity(entity);
    }

    return worldState;
  }

  listEntities(): Entity[] {
    const rows = this.db
      .prepare(
        `
      SELECT id FROM objects WHERE type = 'entity'
    `,
      )
      .all() as { id: string }[];

    const entities: Entity[] = [];
    for (const row of rows) {
      const entity = new Entity(row.id);
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
