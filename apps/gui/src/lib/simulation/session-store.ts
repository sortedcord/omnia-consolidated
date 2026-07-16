import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { SimSession, SavedState } from "./types";
import type { SimSnapshot } from "../simulation-types";

export const DATA_DIR = path.resolve(process.cwd(), "data");

// ---------------------------------------------------------------------------
// Low-level read/write helpers
// ---------------------------------------------------------------------------

export function loadSessionState(
  db: Database.Database,
  id: string,
): SavedState | null {
  try {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS gui_meta (
        id TEXT PRIMARY KEY,
        state_json TEXT
      )`,
    ).run();
    const row = db
      .prepare(`SELECT state_json FROM gui_meta WHERE id = ?`)
      .get(id) as { state_json: string } | undefined;
    return row ? (JSON.parse(row.state_json) as SavedState) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SimSession): void {
  const state: SavedState = {
    scenarioName: session.scenarioName,
    scenarioDescription: session.scenarioDescription,
    turn: session.turn,
    maxTurns: session.maxTurns,
    entities: session.entities,
    playerEntityId: session.playerEntityId,
    entityIndex: session.entityIndex,
    status: session.status,
    error: session.error,
    waitingEntity: session.waitingEntity,
    aliasDoneForTurn: session.aliasDoneForTurn,
    log: session.log,
    providerMappings: session.providerMappings,
  };

  session.db
    .prepare(
      `CREATE TABLE IF NOT EXISTS gui_meta (
        id TEXT PRIMARY KEY,
        state_json TEXT
      )`,
    )
    .run();

  session.db
    .prepare(
      `INSERT INTO gui_meta (id, state_json)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json`,
    )
    .run(session.worldInstanceId, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Session file management
// ---------------------------------------------------------------------------

export function deleteSessionFile(id: string): void {
  const dbPath = path.join(DATA_DIR, `${id}.db`);
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (err) {
      console.error(`Failed to delete session file ${dbPath}:`, err);
    }
  }
}

/**
 * Lists all saved simulation snapshots by scanning the data directory.
 * Active in-memory sessions are snapshotted via the provided callback;
 * inactive ones are read directly from their `.db` files.
 */
export function listSavedSessions(
  activeSessions: Map<string, SimSession>,
  snapshotFn: (session: SimSession) => SimSnapshot,
): SimSnapshot[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  const snapshots: SimSnapshot[] = [];
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("sim-") && f.endsWith(".db"));

  for (const file of files) {
    const id = file.replace(".db", "");
    const dbPath = path.join(DATA_DIR, file);

    const active = activeSessions.get(id);
    if (active) {
      snapshots.push(snapshotFn(active));
      continue;
    }

    try {
      const db = new Database(dbPath);
      const state = loadSessionState(db, id);
      db.close();

      if (state) {
        snapshots.push({
          id,
          status: state.status,
          turn: state.turn,
          maxTurns: state.maxTurns,
          scenarioName: state.scenarioName,
          scenarioDescription: state.scenarioDescription,
          entities: state.entities || [],
          log: state.log || [],
          entityIndex: state.entityIndex,
          waitingEntity: state.waitingEntity,
          error: state.error,
        });
      }
    } catch {
      /* skip corrupt / in-use db files */
    }
  }

  return snapshots.sort((a, b) => {
    const tsA = parseInt(a.id.replace("sim-", ""), 10) || 0;
    const tsB = parseInt(b.id.replace("sim-", ""), 10) || 0;
    return tsB - tsA;
  });
}
