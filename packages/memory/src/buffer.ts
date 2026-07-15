import Database from "better-sqlite3";
import { Entity, resolveAlias } from "@omnia/core";
import { Intent } from "@omnia/intent";

export interface BufferEntry {
  id: string;
  ownerId: string; // Whose subjective memory buffer this lives in
  timestamp: string; // WorldClock.get().toISOString() at write time
  locationId: string | null; // Actor's location when this happened

  intent: Intent; // The actual dialogue/action intent, reused as-is
  outcome?: {
    // Present only for "action" intents processed by the Architect
    isValid: boolean;
    reason: string;
  };
  pinned?: boolean;
}

export { resolveAlias } from "@omnia/core";

export function serializeSubjectiveBufferEntry(
  entry: BufferEntry,
  viewer: Entity,
): string {
  const isSelf = viewer.id === entry.intent.actorId;

  if (isSelf) {
    let details = (
      entry.intent.selfDescription ||
      entry.intent.description ||
      entry.intent.originalText
    ).trim();
    if (details.length > 0) {
      details = details.charAt(0).toUpperCase() + details.slice(1);
    }
    if (entry.intent.type === "action" && entry.outcome) {
      details += ` (Outcome: ${entry.outcome.isValid ? "Succeeded" : `Failed - ${entry.outcome.reason}`})`;
    }
    return details;
  }

  const actorAlias = resolveAlias(viewer, entry.intent.actorId);
  const subjectStr = actorAlias.charAt(0).toUpperCase() + actorAlias.slice(1);

  let details = (entry.intent.description || entry.intent.originalText).trim();
  if (entry.intent.type === "action" && entry.outcome) {
    details += ` (Outcome: ${entry.outcome.isValid ? "Succeeded" : `Failed - ${entry.outcome.reason}`})`;
  }

  return `${subjectStr} ${details}`;
}

export class BufferRepository {
  constructor(private db: Database.Database) {
    // Enable foreign keys for cascading deletes
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buffer_entries (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        location_id TEXT,
        intent_json TEXT NOT NULL,
        outcome_json TEXT,
        pinned INTEGER DEFAULT 0,
        FOREIGN KEY (owner_id) REFERENCES objects(id) ON DELETE CASCADE
      );
    `);

    try {
      this.db.exec(
        `ALTER TABLE buffer_entries ADD COLUMN pinned INTEGER DEFAULT 0;`,
      );
    } catch {
      // ignore
    }
  }

  save(entry: BufferEntry): void {
    this.db
      .prepare(
        `
      INSERT INTO buffer_entries (id, owner_id, timestamp, location_id, intent_json, outcome_json, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_id = excluded.owner_id,
        timestamp = excluded.timestamp,
        location_id = excluded.location_id,
        intent_json = excluded.intent_json,
        outcome_json = excluded.outcome_json,
        pinned = excluded.pinned
    `,
      )
      .run(
        entry.id,
        entry.ownerId,
        entry.timestamp,
        entry.locationId,
        JSON.stringify(entry.intent),
        entry.outcome ? JSON.stringify(entry.outcome) : null,
        entry.pinned ? 1 : 0,
      );
  }

  load(id: string): BufferEntry | null {
    const row = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, intent_json, outcome_json, pinned
      FROM buffer_entries WHERE id = ?
    `,
      )
      .get(id) as
      | {
          id: string;
          owner_id: string;
          timestamp: string;
          location_id: string | null;
          intent_json: string;
          outcome_json: string | null;
          pinned?: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      ownerId: row.owner_id,
      timestamp: row.timestamp,
      locationId: row.location_id,
      intent: JSON.parse(row.intent_json),
      outcome: row.outcome_json ? JSON.parse(row.outcome_json) : undefined,
      pinned: row.pinned === 1,
    };
  }

  listForOwner(ownerId: string): BufferEntry[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, owner_id, timestamp, location_id, intent_json, outcome_json, pinned
      FROM buffer_entries WHERE owner_id = ?
      ORDER BY timestamp ASC
    `,
      )
      .all(ownerId) as {
      id: string;
      owner_id: string;
      timestamp: string;
      location_id: string | null;
      intent_json: string;
      outcome_json: string | null;
      pinned?: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      timestamp: row.timestamp,
      locationId: row.location_id,
      intent: JSON.parse(row.intent_json),
      outcome: row.outcome_json ? JSON.parse(row.outcome_json) : undefined,
      pinned: row.pinned === 1,
    }));
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM buffer_entries WHERE id = ?`).run(id);
  }
}
