import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";

let _db: BetterSqlite3.Database | null = null;
let _dbPathOverride: string | null = null;

export function setDbPath(p: string | null) {
  if (_dbPathOverride !== p) {
    _db?.close();
    _db = null;
    _dbPathOverride = p;
  }
}

function findDbPath(): string {
  if (process.env.OMNIA_DB_PATH) {
    const dir = path.dirname(process.env.OMNIA_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return process.env.OMNIA_DB_PATH;
  }
  let current = process.cwd();
  while (current !== "/" && current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      const dbDir = path.resolve(current, "data");
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      return path.join(dbDir, "settings.db");
    }
    current = path.dirname(current);
  }
  const dbDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, "settings.db");
}

function runMigrations(db: BetterSqlite3.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS provider_instances (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        providerName TEXT NOT NULL,
        apiKey TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 0,
        modelName TEXT,
        type TEXT NOT NULL DEFAULT 'generative',
        maxContext INTEGER,
        endpointUrl TEXT
      )
      `,
    ).run();
    db.pragma("user_version = 1");
  }

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS provider_mappings (
      task TEXT PRIMARY KEY,
      providerInstanceId TEXT NOT NULL
    )
    `,
  ).run();
}

export function getDb(): BetterSqlite3.Database {
  if (!_db) {
    const dbPath = _dbPathOverride ?? findDbPath();
    _db = new Database(dbPath);
    runMigrations(_db);
  }
  return _db;
}
