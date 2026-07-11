import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ModelProviderInstance } from "./llm.js";

let hasBootstrapped = false;

function getWorkspaceRoot() {
  let current = process.cwd();
  while (current !== "/" && current !== path.parse(current).root) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, "package.json"))
    ) {
      if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
        return current;
      }
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

function getSettingsDb() {
  const wsRoot = getWorkspaceRoot();
  const dbDir = path.resolve(wsRoot, "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "settings.db");
  const db = new Database(dbPath);
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS provider_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      providerName TEXT NOT NULL,
      apiKey TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 0,
      modelName TEXT,
      type TEXT NOT NULL DEFAULT 'generative'
    )
  `).run();

  try {
    db.prepare(`ALTER TABLE provider_instances ADD COLUMN modelName TEXT`).run();
  } catch {
    // ignore
  }

  try {
    db.prepare(`ALTER TABLE provider_instances ADD COLUMN type TEXT NOT NULL DEFAULT 'generative'`).run();
  } catch {
    // ignore
  }

  // Auto-bootstrap environment variables if DB contains 0 instances
  try {
    if (!hasBootstrapped) {
      const totalCount = db.prepare(`SELECT COUNT(*) as count FROM provider_instances`).get() as { count: number };
      if (totalCount.count === 0) {
        const googleKey = process.env.GOOGLE_API_KEY;
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        let hasInsertedGenerative = false;

        if (googleKey && googleKey.trim()) {
          const id = "provider-default-google";
          db.prepare(`
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, "Gemini (Env)", "google-genai", googleKey.trim(), 1, "gemini-2.5-flash", "generative");
          hasInsertedGenerative = true;

          const embedId = "provider-default-google-embed";
          db.prepare(`
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(embedId, "Gemini Embed (Env)", "google-genai", googleKey.trim(), 1, "gemini-embedding-001", "embedding");
        }

        if (openRouterKey && openRouterKey.trim()) {
          const id = "provider-default-openrouter";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(`
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, "OpenRouter (Env)", "openrouter", openRouterKey.trim(), isActive, "google/gemini-2.5-flash", "generative");
        }
      }
      hasBootstrapped = true;
    }
  } catch {
    // ignore write lock issues or other DB errors during bootstrap
  }
  
  return db;
}

export class ProviderManager {
  static list(): ModelProviderInstance[] {
    const db = getSettingsDb();
    try {
      const rows = db.prepare(`SELECT * FROM provider_instances`).all() as {
        id: string;
        name: string;
        providerName: string;
        apiKey: string;
        isActive: number;
        modelName?: string;
        type: string;
      }[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        providerName: r.providerName,
        apiKey: r.apiKey,
        isActive: r.isActive === 1,
        modelName: r.modelName || undefined,
        type: (r.type as "generative" | "embedding") || "generative",
      }));
    } finally {
      db.close();
    }
  }

  static create(
    name: string,
    providerName: string,
    apiKey: string,
    modelName?: string,
    type: "generative" | "embedding" = "generative"
  ): ModelProviderInstance {
    const db = getSettingsDb();
    try {
      const id = "provider-" + Date.now();
      const activeCount = db
        .prepare(`SELECT COUNT(*) as count FROM provider_instances WHERE isActive = 1 AND type = ?`)
        .get(type) as { count: number };
      const isActive = activeCount.count === 0 ? 1 : 0;
      
      db.prepare(`
        INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, providerName, apiKey, isActive, modelName || null, type);
      
      return { id, name, providerName, apiKey, isActive: isActive === 1, modelName, type };
    } finally {
      db.close();
    }
  }

  static delete(id: string): void {
    const db = getSettingsDb();
    try {
      const provider = db.prepare(`SELECT isActive, type FROM provider_instances WHERE id = ?`).get(id) as { isActive: number; type: string } | undefined;
      db.prepare(`DELETE FROM provider_instances WHERE id = ?`).run(id);
      
      if (provider && provider.isActive === 1) {
        const next = db
          .prepare(`SELECT id FROM provider_instances WHERE type = ? LIMIT 1`)
          .get(provider.type) as { id: string } | undefined;
        if (next) {
          db.prepare(`UPDATE provider_instances SET isActive = 1 WHERE id = ?`).run(next.id);
        }
      }
    } finally {
      db.close();
    }
  }

  static setActive(id: string): void {
    const db = getSettingsDb();
    try {
      const target = db.prepare(`SELECT type FROM provider_instances WHERE id = ?`).get(id) as { type: string } | undefined;
      if (target) {
        db.prepare(`UPDATE provider_instances SET isActive = 0 WHERE type = ?`).run(target.type);
        db.prepare(`UPDATE provider_instances SET isActive = 1 WHERE id = ?`).run(id);
      }
    } finally {
      db.close();
    }
  }

  static update(
    id: string,
    name: string,
    providerName: string,
    apiKey?: string,
    modelName?: string,
    type: "generative" | "embedding" = "generative"
  ): void {
    const db = getSettingsDb();
    try {
      if (apiKey && apiKey.trim()) {
        db.prepare(`
          UPDATE provider_instances
          SET name = ?, providerName = ?, apiKey = ?, modelName = ?, type = ?
          WHERE id = ?
        `).run(name, providerName, apiKey, modelName || null, type, id);
      } else {
        db.prepare(`
          UPDATE provider_instances
          SET name = ?, providerName = ?, modelName = ?, type = ?
          WHERE id = ?
        `).run(name, providerName, modelName || null, type, id);
      }
    } finally {
      db.close();
    }
  }

  static getActive(type: "generative" | "embedding" = "generative"): ModelProviderInstance | null {
    const db = getSettingsDb();
    try {
      const row = db.prepare(`SELECT * FROM provider_instances WHERE isActive = 1 AND type = ?`).get(type) as {
        id: string;
        name: string;
        providerName: string;
        apiKey: string;
        isActive: number;
        modelName?: string;
        type: string;
      } | undefined;

      if (!row) {
        const totalCount = db.prepare(`SELECT COUNT(*) as count FROM provider_instances`).get() as { count: number };
        if (totalCount.count === 0) {
          const googleKey = process.env.GOOGLE_API_KEY;
          const openRouterKey = process.env.OPENROUTER_API_KEY;
          let hasInsertedGenerative = false;

          if (googleKey && googleKey.trim()) {
            const id = "provider-default-google";
            db.prepare(`
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, "Gemini (Env)", "google-genai", googleKey.trim(), 1, "gemini-2.5-flash", "generative");
            hasInsertedGenerative = true;

            const embedId = "provider-default-google-embed";
            db.prepare(`
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(embedId, "Gemini Embed (Env)", "google-genai", googleKey.trim(), 1, "gemini-embedding-001", "embedding");
          }

          if (openRouterKey && openRouterKey.trim()) {
            const id = "provider-default-openrouter";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(`
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, "OpenRouter (Env)", "openrouter", openRouterKey.trim(), isActive, "google/gemini-2.5-flash", "generative");
          }

          const retryRow = db.prepare(`SELECT * FROM provider_instances WHERE isActive = 1 AND type = ?`).get(type) as {
            id: string;
            name: string;
            providerName: string;
            apiKey: string;
            isActive: number;
            modelName?: string;
            type: string;
          } | undefined;

          if (retryRow) {
            return {
              id: retryRow.id,
              name: retryRow.name,
              providerName: retryRow.providerName,
              apiKey: retryRow.apiKey,
              isActive: true,
              modelName: retryRow.modelName || undefined,
              type: retryRow.type as "generative" | "embedding",
            };
          }
        }

        // If there's no active row but some rows exist, return the first one as active, or update it
        const firstRow = db.prepare(`SELECT * FROM provider_instances WHERE type = ? LIMIT 1`).get(type) as {
          id: string;
          name: string;
          providerName: string;
          apiKey: string;
          isActive: number;
          modelName?: string;
          type: string;
        } | undefined;
        if (firstRow) {
          db.prepare(`UPDATE provider_instances SET isActive = 1 WHERE id = ?`).run(firstRow.id);
          return {
            id: firstRow.id,
            name: firstRow.name,
            providerName: firstRow.providerName,
            apiKey: firstRow.apiKey,
            isActive: true,
            modelName: firstRow.modelName || undefined,
            type: firstRow.type as "generative" | "embedding",
          };
        }
        return null;
      }

      return {
        id: row.id,
        name: row.name,
        providerName: row.providerName,
        apiKey: row.apiKey,
        isActive: true,
        modelName: row.modelName || undefined,
        type: (row.type as "generative" | "embedding") || "generative",
      };
    } catch {
      const googleKey = process.env.GOOGLE_API_KEY;
      if (type === "embedding") {
        if (googleKey && googleKey.trim()) {
          return {
            id: "provider-default-env-embed-fallback",
            name: "Gemini Embed (Env Fallback)",
            providerName: "google-genai",
            apiKey: googleKey.trim(),
            isActive: true,
            modelName: "gemini-embedding-001",
            type: "embedding",
          };
        }
        return null;
      }

      // generative fallback
      if (googleKey && googleKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "Gemini (Env Fallback)",
          providerName: "google-genai",
          apiKey: googleKey.trim(),
          isActive: true,
          modelName: "gemini-2.5-flash",
          type: "generative",
        };
      }
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (openRouterKey && openRouterKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "OpenRouter (Env Fallback)",
          providerName: "openrouter",
          apiKey: openRouterKey.trim(),
          isActive: true,
          modelName: "google/gemini-2.5-flash",
          type: "generative",
        };
      }
      return null;
    } finally {
      db.close();
    }
  }

  static getMappings(): Record<string, string> {
    const db = getSettingsDb();
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS provider_mappings (
          task TEXT PRIMARY KEY,
          providerInstanceId TEXT NOT NULL
        )
      `).run();
      const rows = db.prepare(`SELECT * FROM provider_mappings`).all() as {
        task: string;
        providerInstanceId: string;
      }[];
      const mappings: Record<string, string> = {};
      for (const row of rows) {
        mappings[row.task] = row.providerInstanceId;
      }
      return mappings;
    } finally {
      db.close();
    }
  }

  static setMapping(task: string, providerInstanceId: string): void {
    const db = getSettingsDb();
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS provider_mappings (
          task TEXT PRIMARY KEY,
          providerInstanceId TEXT NOT NULL
        )
      `).run();
      if (!providerInstanceId) {
        db.prepare(`DELETE FROM provider_mappings WHERE task = ?`).run(task);
      } else {
        db.prepare(`
          INSERT INTO provider_mappings (task, providerInstanceId)
          VALUES (?, ?)
          ON CONFLICT(task) DO UPDATE SET providerInstanceId = excluded.providerInstanceId
        `).run(task, providerInstanceId);
      }
    } finally {
      db.close();
    }
  }
}
