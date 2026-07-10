import Database from "better-sqlite3";

export interface LedgerEntry {
  id: string;
  ownerId: string;
  timestamp: string;
  locationId: string | null;
  involvedEntityIds: string[];

  content: string;
  quotes: string[];
  importance: number;
  embedding: number[];
}

export class LedgerRepository {
  constructor(private db: Database.Database) {
    // Enable foreign keys for cascading deletes
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        location_id TEXT,
        content TEXT NOT NULL,
        quotes_json TEXT,
        importance INTEGER NOT NULL,
        embedding BLOB,
        FOREIGN KEY (owner_id) REFERENCES objects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ledger_involved_entities (
        entry_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (entry_id, entity_id),
        FOREIGN KEY (entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger_entries(owner_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_location ON ledger_entries(location_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_importance ON ledger_entries(importance);
      CREATE INDEX IF NOT EXISTS idx_ledger_involved_entity ON ledger_involved_entities(entity_id);
    `);
  }

  save(entry: LedgerEntry): void {
    const insertEntry = this.db.prepare(`
      INSERT INTO ledger_entries (id, owner_id, timestamp, location_id, content, quotes_json, importance, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_id = excluded.owner_id,
        timestamp = excluded.timestamp,
        location_id = excluded.location_id,
        content = excluded.content,
        quotes_json = excluded.quotes_json,
        importance = excluded.importance,
        embedding = excluded.embedding
    `);

    const insertEntity = this.db.prepare(`
      INSERT OR IGNORE INTO ledger_involved_entities (entry_id, entity_id)
      VALUES (?, ?)
    `);

    const deleteEntities = this.db.prepare(`
      DELETE FROM ledger_involved_entities WHERE entry_id = ?
    `);

    this.db.transaction(() => {
      insertEntry.run(
        entry.id,
        entry.ownerId,
        entry.timestamp,
        entry.locationId,
        entry.content,
        JSON.stringify(entry.quotes),
        entry.importance,
        entry.embedding.length > 0
          ? Buffer.from(new Float32Array(entry.embedding).buffer)
          : null
      );

      deleteEntities.run(entry.id);
      for (const entityId of entry.involvedEntityIds) {
        insertEntity.run(entry.id, entityId);
      }
    })();
  }

  load(id: string): LedgerEntry | null {
    const row = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, content, quotes_json, importance, embedding
      FROM ledger_entries
      WHERE id = ?
    `
      )
      .get(id) as any;

    if (!row) return null;

    const entitiesRows = this.db
      .prepare(
        `
      SELECT entity_id FROM ledger_involved_entities WHERE entry_id = ?
    `
      )
      .all(id) as { entity_id: string }[];

    let embedding: number[] = [];
    if (row.embedding) {
      const buffer = row.embedding as Buffer;
      const floatArray = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
      );
      embedding = Array.from(floatArray);
    }

    return {
      id: row.id,
      ownerId: row.owner_id,
      timestamp: row.timestamp,
      locationId: row.location_id,
      involvedEntityIds: entitiesRows.map((er) => er.entity_id),
      content: row.content,
      quotes: JSON.parse(row.quotes_json),
      importance: row.importance,
      embedding: embedding,
    };
  }

  /**
   * Retrieves relevant ledger entries using Phase 1: Deterministic Heuristic Filtering
   * Filters by:
   * 1. locationId matches current location
   * 2. involvedEntityIds overlaps with current involved entities
   * 3. importance >= 8 (high salience)
   */
  getRelevant(
    ownerId: string,
    currentLocationId: string | null,
    currentInvolvedEntityIds: string[],
    limit: number = 20
  ): LedgerEntry[] {
    let query = `
      SELECT DISTINCT le.id, le.owner_id, le.timestamp, le.location_id, le.content, le.quotes_json, le.importance, le.embedding
      FROM ledger_entries le
      LEFT JOIN ledger_involved_entities lie ON le.id = lie.entry_id
      WHERE le.owner_id = ? 
        AND (
          le.importance >= 8
    `;

    const params: any[] = [ownerId];

    if (currentLocationId) {
      query += ` OR le.location_id = ?`;
      params.push(currentLocationId);
    }

    if (currentInvolvedEntityIds.length > 0) {
      const placeholders = currentInvolvedEntityIds.map(() => "?").join(",");
      query += ` OR lie.entity_id IN (${placeholders})`;
      params.push(...currentInvolvedEntityIds);
    }

    query += `
        )
      ORDER BY le.timestamp DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];

    if (rows.length === 0) return [];

    const entryIds = rows.map((r) => r.id);
    const placeholders = entryIds.map(() => "?").join(",");
    const entitiesRows = this.db
      .prepare(
        `
      SELECT entry_id, entity_id FROM ledger_involved_entities
      WHERE entry_id IN (${placeholders})
    `
      )
      .all(...entryIds) as { entry_id: string; entity_id: string }[];

    const entitiesMap = new Map<string, string[]>();
    for (const er of entitiesRows) {
      if (!entitiesMap.has(er.entry_id)) {
        entitiesMap.set(er.entry_id, []);
      }
      entitiesMap.get(er.entry_id)!.push(er.entity_id);
    }

    return rows.map((row) => {
      let embedding: number[] = [];
      if (row.embedding) {
        const buffer = row.embedding as Buffer;
        const floatArray = new Float32Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
        );
        embedding = Array.from(floatArray);
      }
      return {
        id: row.id,
        ownerId: row.owner_id,
        timestamp: row.timestamp,
        locationId: row.location_id,
        involvedEntityIds: entitiesMap.get(row.id) || [],
        content: row.content,
        quotes: JSON.parse(row.quotes_json),
        importance: row.importance,
        embedding: embedding,
      };
    });
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM ledger_entries WHERE id = ?`).run(id);
  }
}
