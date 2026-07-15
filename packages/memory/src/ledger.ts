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
          : null,
      );

      deleteEntities.run(entry.id);
      for (const entityId of entry.involvedEntityIds) {
        insertEntity.run(entry.id, entityId);
      }
    })();
  }

  private mapRowToEntry(
    row: Record<string, unknown>,
    involvedEntityIds: string[],
  ): LedgerEntry {
    const embedding: number[] = row.embedding
      ? Array.from(
          new Float32Array(
            (row.embedding as Buffer).buffer,
            (row.embedding as Buffer).byteOffset,
            (row.embedding as Buffer).byteLength /
              Float32Array.BYTES_PER_ELEMENT,
          ),
        )
      : [];

    return {
      id: row.id as string,
      ownerId: row.owner_id as string,
      timestamp: row.timestamp as string,
      locationId: row.location_id as string | null,
      involvedEntityIds,
      content: row.content as string,
      quotes: JSON.parse((row.quotes_json as string) || "[]"),
      importance: row.importance as number,
      embedding,
    };
  }

  load(id: string): LedgerEntry | null {
    const row = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, content, quotes_json, importance, embedding
      FROM ledger_entries
      WHERE id = ?
    `,
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const entitiesRows = this.db
      .prepare(
        `
      SELECT entity_id FROM ledger_involved_entities WHERE entry_id = ?
    `,
      )
      .all(id) as { entity_id: string }[];

    return this.mapRowToEntry(
      row,
      entitiesRows.map((er) => er.entity_id),
    );
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
    limit: number = 20,
  ): LedgerEntry[] {
    let query = `
      SELECT DISTINCT le.id, le.owner_id, le.timestamp, le.location_id, le.content, le.quotes_json, le.importance, le.embedding
      FROM ledger_entries le
      LEFT JOIN ledger_involved_entities lie ON le.id = lie.entry_id
      WHERE le.owner_id = ? 
        AND (
          le.importance >= 8
    `;

    const params: (string | number)[] = [ownerId];

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

    const rows = this.db.prepare(query).all(...params) as Record<
      string,
      unknown
    >[];

    if (rows.length === 0) return [];

    const entryIds = rows.map((r) => r.id as string);
    const placeholders = entryIds.map(() => "?").join(",");
    const entitiesRows = this.db
      .prepare(
        `
      SELECT entry_id, entity_id FROM ledger_involved_entities
      WHERE entry_id IN (${placeholders})
    `,
      )
      .all(...entryIds) as { entry_id: string; entity_id: string }[];

    const entitiesMap = new Map<string, string[]>();
    for (const er of entitiesRows) {
      if (!entitiesMap.has(er.entry_id)) {
        entitiesMap.set(er.entry_id, []);
      }
      entitiesMap.get(er.entry_id)!.push(er.entity_id);
    }

    return rows.map((row) =>
      this.mapRowToEntry(row, entitiesMap.get(row.id as string) || []),
    );
  }

  private fetchRawNeighbors(ownerId: string, timestamp: string): LedgerEntry[] {
    const neighbors: LedgerEntry[] = [];

    // Preceding entry
    const preceding = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, content, quotes_json, importance, embedding
      FROM ledger_entries
      WHERE owner_id = ? AND timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1
    `,
      )
      .get(ownerId, timestamp) as Record<string, unknown> | undefined;

    if (preceding) {
      neighbors.push(this.mapRowToEntry(preceding, []));
    }

    // Succeeding entry
    const succeeding = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, content, quotes_json, importance, embedding
      FROM ledger_entries
      WHERE owner_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
      LIMIT 1
    `,
      )
      .get(ownerId, timestamp) as Record<string, unknown> | undefined;

    if (succeeding) {
      neighbors.push(this.mapRowToEntry(succeeding, []));
    }

    return neighbors;
  }

  /**
   * Phase 1 + Phase 2 Retrieval Pipeline
   * 1. Fetches candidates via Phase 1 heuristic filtering.
   * 2. Ranks them using: Score = Recency + Importance + Semantic Match.
   * 3. Selects the top `limit` memories.
   * 4. Optionally pulls in the immediate chronological neighbors (associative chain).
   * 5. Returns all gathered entries sorted chronologically (timestamp ASC).
   */
  retrieve(
    ownerId: string,
    currentLocationId: string | null,
    currentInvolvedEntityIds: string[],
    queryEmbedding?: number[],
    now: Date = new Date(),
    limit: number = 5,
    options?: {
      includeAssociativeNeighbors?: boolean;
      recencyWeight?: number;
      importanceWeight?: number;
      relevanceWeight?: number;
      decayRate?: number;
    },
  ): LedgerEntry[] {
    const includeAssociativeNeighbors =
      options?.includeAssociativeNeighbors ?? false;
    const recencyWeight = options?.recencyWeight ?? 1.0;
    const importanceWeight = options?.importanceWeight ?? 1.0;
    const relevanceWeight = options?.relevanceWeight ?? 1.0;
    const decayRate = options?.decayRate ?? 0.99;

    // Fetch candidate pool (limit 100 to provide enough options for Phase 2 ranking)
    const candidates = this.getRelevant(
      ownerId,
      currentLocationId,
      currentInvolvedEntityIds,
      100,
    );
    if (candidates.length === 0) return [];

    // Score candidates
    const scored = candidates.map((entry) => {
      // Recency calculation with exponential decay
      const deltaMs = now.getTime() - new Date(entry.timestamp).getTime();
      const hoursElapsed = Math.max(0, deltaMs / (3600 * 1000));
      const recency = Math.pow(decayRate, hoursElapsed);

      // Importance score normalized (0.0 to 1.0)
      const importanceNorm = entry.importance / 10.0;

      // Semantic relevance
      let relevance = 0;
      if (queryEmbedding && entry.embedding && entry.embedding.length > 0) {
        relevance = cosineSimilarity(queryEmbedding, entry.embedding);
      }

      const score =
        recencyWeight * recency +
        importanceWeight * importanceNorm +
        relevanceWeight * relevance;

      return { entry, score };
    });

    // Rank and take top memories
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, limit).map((s) => s.entry);

    const finalEntries = [...selected];

    // Optionally retrieve associative neighbors
    if (includeAssociativeNeighbors && selected.length > 0) {
      const neighborMap = new Map<string, LedgerEntry>();

      for (const entry of selected) {
        const rawNeighbors = this.fetchRawNeighbors(ownerId, entry.timestamp);
        for (const rn of rawNeighbors) {
          if (
            !finalEntries.some((fe) => fe.id === rn.id) &&
            !neighborMap.has(rn.id)
          ) {
            neighborMap.set(rn.id, rn);
          }
        }
      }

      const neighborsToPopulate = Array.from(neighborMap.values());
      if (neighborsToPopulate.length > 0) {
        const neighborIds = neighborsToPopulate.map((n) => n.id);
        const placeholders = neighborIds.map(() => "?").join(",");
        const entitiesRows = this.db
          .prepare(
            `
          SELECT entry_id, entity_id FROM ledger_involved_entities
          WHERE entry_id IN (${placeholders})
        `,
          )
          .all(...neighborIds) as { entry_id: string; entity_id: string }[];

        const entitiesMap = new Map<string, string[]>();
        for (const er of entitiesRows) {
          if (!entitiesMap.has(er.entry_id)) {
            entitiesMap.set(er.entry_id, []);
          }
          entitiesMap.get(er.entry_id)!.push(er.entity_id);
        }

        for (const n of neighborsToPopulate) {
          n.involvedEntityIds = entitiesMap.get(n.id) || [];
          finalEntries.push(n);
        }
      }
    }

    // Sort chronologically ASC for the final prompt output
    finalEntries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    return finalEntries;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM ledger_entries WHERE id = ?`).run(id);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
