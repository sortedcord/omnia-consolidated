import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ModelProviderInstance } from "./llm.js";

let dbPathOverride: string | null = null;
let hasBootstrapped = false;

export function setDbPathOverride(p: string | null) {
  dbPathOverride = p;
}

export function resetHasBootstrapped() {
  hasBootstrapped = false;
}

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
  let dbPath: string;
  if (dbPathOverride) {
    dbPath = dbPathOverride;
  } else {
    const wsRoot = getWorkspaceRoot();
    const dbDir = path.resolve(wsRoot, "data");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    dbPath = path.join(dbDir, "settings.db");
  }
  const db = new Database(dbPath);

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS provider_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      providerName TEXT NOT NULL,
      apiKey TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 0,
      modelName TEXT,
      type TEXT NOT NULL DEFAULT 'generative'
    )
  `,
  ).run();

  try {
    db.prepare(
      `ALTER TABLE provider_instances ADD COLUMN modelName TEXT`,
    ).run();
  } catch {
    // ignore
  }

  try {
    db.prepare(
      `ALTER TABLE provider_instances ADD COLUMN type TEXT NOT NULL DEFAULT 'generative'`,
    ).run();
  } catch {
    // ignore
  }

  try {
    db.prepare(
      `ALTER TABLE provider_instances ADD COLUMN maxContext INTEGER`,
    ).run();
  } catch {
    // ignore
  }

  try {
    db.prepare(
      `ALTER TABLE provider_instances ADD COLUMN endpointUrl TEXT`,
    ).run();
  } catch {
    // ignore
  }

  // Auto-bootstrap environment variables if DB contains 0 instances
  try {
    if (!hasBootstrapped) {
      const totalCount = db
        .prepare(`SELECT COUNT(*) as count FROM provider_instances`)
        .get() as { count: number };
      if (totalCount.count === 0) {
        const googleKey = process.env.GOOGLE_API_KEY;
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        let hasInsertedGenerative = false;
        let hasInsertedEmbedding = false;

        if (googleKey && googleKey.trim()) {
          const id = "provider-default-google";
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "Gemini (Env)",
            "google-genai",
            googleKey.trim(),
            1,
            "gemini-2.5-flash",
            "generative",
            32768,
          );
          hasInsertedGenerative = true;

          const embedId = "provider-default-google-embed";
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            embedId,
            "Gemini Embed (Env)",
            "google-genai",
            googleKey.trim(),
            1,
            "gemini-embedding-001",
            "embedding",
            0,
          );
          hasInsertedEmbedding = true;
        }

        if (anthropicKey && anthropicKey.trim()) {
          const id = "provider-default-anthropic";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "Anthropic (Env)",
            "anthropic",
            anthropicKey.trim(),
            isActive,
            "claude-3-5-sonnet-latest",
            "generative",
            200000,
          );
          if (isActive === 1) {
            hasInsertedGenerative = true;
          }
        }

        if (openaiKey && openaiKey.trim()) {
          const id = "provider-default-openai";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "OpenAI (Env)",
            "openai",
            openaiKey.trim(),
            isActive,
            "gpt-4o-mini",
            "generative",
            128000,
          );
          if (isActive === 1) {
            hasInsertedGenerative = true;
          }

          const embedId = "provider-default-openai-embed";
          const isEmbedActive = hasInsertedEmbedding ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            embedId,
            "OpenAI Embed (Env)",
            "openai",
            openaiKey.trim(),
            isEmbedActive,
            "text-embedding-3-small",
            "embedding",
            0,
          );
          if (isEmbedActive === 1) {
            hasInsertedEmbedding = true;
          }
        }

        if (groqKey && groqKey.trim()) {
          const id = "provider-default-groq";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "Groq (Env)",
            "groq",
            groqKey.trim(),
            isActive,
            "llama-3.3-70b-versatile",
            "generative",
            8192,
          );
          if (isActive === 1) {
            hasInsertedGenerative = true;
          }
        }

        if (deepseekKey && deepseekKey.trim()) {
          const id = "provider-default-deepseek";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "DeepSeek (Env)",
            "deepseek",
            deepseekKey.trim(),
            isActive,
            "deepseek-chat",
            "generative",
            64000,
          );
          if (isActive === 1) {
            hasInsertedGenerative = true;
          }
        }

        if (openRouterKey && openRouterKey.trim()) {
          const id = "provider-default-openrouter";
          const isActive = hasInsertedGenerative ? 0 : 1;
          db.prepare(
            `
            INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            "OpenRouter (Env)",
            "openrouter",
            openRouterKey.trim(),
            isActive,
            "google/gemini-2.5-flash",
            "generative",
            32768,
          );
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
        maxContext?: number;
        endpointUrl?: string;
      }[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        providerName: r.providerName,
        apiKey: r.apiKey,
        isActive: r.isActive === 1,
        modelName: r.modelName || undefined,
        type: (r.type as "generative" | "embedding") || "generative",
        maxContext:
          r.maxContext !== undefined && r.maxContext !== null
            ? r.maxContext
            : r.type === "embedding"
              ? 0
              : 32768,
        endpointUrl: r.endpointUrl || undefined,
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
    type: "generative" | "embedding" = "generative",
    maxContext?: number,
    endpointUrl?: string,
  ): ModelProviderInstance {
    const db = getSettingsDb();
    try {
      const id = "provider-" + Date.now();
      const activeCount = db
        .prepare(
          `SELECT COUNT(*) as count FROM provider_instances WHERE isActive = 1 AND type = ?`,
        )
        .get(type) as { count: number };
      const isActive = activeCount.count === 0 ? 1 : 0;

      const actualMaxContext =
        maxContext !== undefined
          ? maxContext
          : type === "generative"
            ? 32768
            : 0;

      db.prepare(
        `
        INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext, endpointUrl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        id,
        name,
        providerName,
        apiKey,
        isActive,
        modelName || null,
        type,
        actualMaxContext,
        endpointUrl || null,
      );

      return {
        id,
        name,
        providerName,
        apiKey,
        isActive: isActive === 1,
        modelName,
        type,
        maxContext: actualMaxContext,
        endpointUrl,
      };
    } finally {
      db.close();
    }
  }

  static delete(id: string): void {
    const db = getSettingsDb();
    try {
      const provider = db
        .prepare(`SELECT isActive, type FROM provider_instances WHERE id = ?`)
        .get(id) as { isActive: number; type: string } | undefined;
      db.prepare(`DELETE FROM provider_instances WHERE id = ?`).run(id);

      if (provider && provider.isActive === 1) {
        const next = db
          .prepare(`SELECT id FROM provider_instances WHERE type = ? LIMIT 1`)
          .get(provider.type) as { id: string } | undefined;
        if (next) {
          db.prepare(
            `UPDATE provider_instances SET isActive = 1 WHERE id = ?`,
          ).run(next.id);
        }
      }
    } finally {
      db.close();
    }
  }

  static setActive(id: string): void {
    const db = getSettingsDb();
    try {
      const target = db
        .prepare(`SELECT type FROM provider_instances WHERE id = ?`)
        .get(id) as { type: string } | undefined;
      if (target) {
        db.prepare(
          `UPDATE provider_instances SET isActive = 0 WHERE type = ?`,
        ).run(target.type);
        db.prepare(
          `UPDATE provider_instances SET isActive = 1 WHERE id = ?`,
        ).run(id);
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
    type: "generative" | "embedding" = "generative",
    maxContext?: number,
    endpointUrl?: string,
  ): void {
    const db = getSettingsDb();
    try {
      const actualMaxContext =
        maxContext !== undefined
          ? maxContext
          : type === "generative"
            ? 32768
            : 0;
      if (apiKey && apiKey.trim()) {
        db.prepare(
          `
          UPDATE provider_instances
          SET name = ?, providerName = ?, apiKey = ?, modelName = ?, type = ?, maxContext = ?, endpointUrl = ?
          WHERE id = ?
        `,
        ).run(
          name,
          providerName,
          apiKey,
          modelName || null,
          type,
          actualMaxContext,
          endpointUrl || null,
          id,
        );
      } else {
        db.prepare(
          `
          UPDATE provider_instances
          SET name = ?, providerName = ?, modelName = ?, type = ?, maxContext = ?, endpointUrl = ?
          WHERE id = ?
        `,
        ).run(
          name,
          providerName,
          modelName || null,
          type,
          actualMaxContext,
          endpointUrl || null,
          id,
        );
      }
    } finally {
      db.close();
    }
  }

  static getActive(
    type: "generative" | "embedding" = "generative",
  ): ModelProviderInstance | null {
    const db = getSettingsDb();
    try {
      const row = db
        .prepare(
          `SELECT * FROM provider_instances WHERE isActive = 1 AND type = ?`,
        )
        .get(type) as
        | {
            id: string;
            name: string;
            providerName: string;
            apiKey: string;
            isActive: number;
            modelName?: string;
            type: string;
            maxContext?: number;
            endpointUrl?: string;
          }
        | undefined;

      if (!row) {
        const totalCount = db
          .prepare(`SELECT COUNT(*) as count FROM provider_instances`)
          .get() as { count: number };
        if (totalCount.count === 0) {
          const googleKey = process.env.GOOGLE_API_KEY;
          const openRouterKey = process.env.OPENROUTER_API_KEY;
          const anthropicKey = process.env.ANTHROPIC_API_KEY;
          const openaiKey = process.env.OPENAI_API_KEY;
          const groqKey = process.env.GROQ_API_KEY;
          const deepseekKey = process.env.DEEPSEEK_API_KEY;
          let hasInsertedGenerative = false;
          let hasInsertedEmbedding = false;

          if (googleKey && googleKey.trim()) {
            const id = "provider-default-google";
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "Gemini (Env)",
              "google-genai",
              googleKey.trim(),
              1,
              "gemini-2.5-flash",
              "generative",
              32768,
            );
            hasInsertedGenerative = true;

            const embedId = "provider-default-google-embed";
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              embedId,
              "Gemini Embed (Env)",
              "google-genai",
              googleKey.trim(),
              1,
              "gemini-embedding-001",
              "embedding",
              0,
            );
            hasInsertedEmbedding = true;
          }

          if (anthropicKey && anthropicKey.trim()) {
            const id = "provider-default-anthropic";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "Anthropic (Env)",
              "anthropic",
              anthropicKey.trim(),
              isActive,
              "claude-3-5-sonnet-latest",
              "generative",
              200000,
            );
            if (isActive === 1) {
              hasInsertedGenerative = true;
            }
          }

          if (openaiKey && openaiKey.trim()) {
            const id = "provider-default-openai";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "OpenAI (Env)",
              "openai",
              openaiKey.trim(),
              isActive,
              "gpt-4o-mini",
              "generative",
              128000,
            );
            if (isActive === 1) {
              hasInsertedGenerative = true;
            }

            const embedId = "provider-default-openai-embed";
            const isEmbedActive = hasInsertedEmbedding ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              embedId,
              "OpenAI Embed (Env)",
              "openai",
              openaiKey.trim(),
              isEmbedActive,
              "text-embedding-3-small",
              "embedding",
              0,
            );
            if (isEmbedActive === 1) {
              hasInsertedEmbedding = true;
            }
          }

          if (groqKey && groqKey.trim()) {
            const id = "provider-default-groq";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "Groq (Env)",
              "groq",
              groqKey.trim(),
              isActive,
              "llama-3.3-70b-versatile",
              "generative",
              8192,
            );
            if (isActive === 1) {
              hasInsertedGenerative = true;
            }
          }

          if (deepseekKey && deepseekKey.trim()) {
            const id = "provider-default-deepseek";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "DeepSeek (Env)",
              "deepseek",
              deepseekKey.trim(),
              isActive,
              "deepseek-chat",
              "generative",
              64000,
            );
            if (isActive === 1) {
              hasInsertedGenerative = true;
            }
          }

          if (openRouterKey && openRouterKey.trim()) {
            const id = "provider-default-openrouter";
            const isActive = hasInsertedGenerative ? 0 : 1;
            db.prepare(
              `
              INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            ).run(
              id,
              "OpenRouter (Env)",
              "openrouter",
              openRouterKey.trim(),
              isActive,
              "google/gemini-2.5-flash",
              "generative",
              32768,
            );
          }

          const retryRow = db
            .prepare(
              `SELECT * FROM provider_instances WHERE isActive = 1 AND type = ?`,
            )
            .get(type) as
            | {
                id: string;
                name: string;
                providerName: string;
                apiKey: string;
                isActive: number;
                modelName?: string;
                type: string;
                maxContext?: number;
                endpointUrl?: string;
              }
            | undefined;

          if (retryRow) {
            return {
              id: retryRow.id,
              name: retryRow.name,
              providerName: retryRow.providerName,
              apiKey: retryRow.apiKey,
              isActive: true,
              modelName: retryRow.modelName || undefined,
              type: retryRow.type as "generative" | "embedding",
              maxContext:
                retryRow.maxContext !== undefined &&
                retryRow.maxContext !== null
                  ? retryRow.maxContext
                  : retryRow.type === "embedding"
                    ? 0
                    : 32768,
              endpointUrl: retryRow.endpointUrl || undefined,
            };
          }
        }

        // If there's no active row but some rows exist, return the first one as active, or update it
        const firstRow = db
          .prepare(`SELECT * FROM provider_instances WHERE type = ? LIMIT 1`)
          .get(type) as
          | {
              id: string;
              name: string;
              providerName: string;
              apiKey: string;
              isActive: number;
              modelName?: string;
              type: string;
              maxContext?: number;
              endpointUrl?: string;
            }
          | undefined;
        if (firstRow) {
          db.prepare(
            `UPDATE provider_instances SET isActive = 1 WHERE id = ?`,
          ).run(firstRow.id);
          return {
            id: firstRow.id,
            name: firstRow.name,
            providerName: firstRow.providerName,
            apiKey: firstRow.apiKey,
            isActive: true,
            modelName: firstRow.modelName || undefined,
            type: firstRow.type as "generative" | "embedding",
            maxContext:
              firstRow.maxContext !== undefined && firstRow.maxContext !== null
                ? firstRow.maxContext
                : firstRow.type === "embedding"
                  ? 0
                  : 32768,
            endpointUrl: firstRow.endpointUrl || undefined,
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
        maxContext:
          row.maxContext !== undefined && row.maxContext !== null
            ? row.maxContext
            : row.type === "embedding"
              ? 0
              : 32768,
        endpointUrl: row.endpointUrl || undefined,
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
            maxContext: 0,
          };
        }
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey && openaiKey.trim()) {
          return {
            id: "provider-default-env-embed-fallback",
            name: "OpenAI Embed (Env Fallback)",
            providerName: "openai",
            apiKey: openaiKey.trim(),
            isActive: true,
            modelName: "text-embedding-3-small",
            type: "embedding",
            maxContext: 0,
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
          maxContext: 32768,
        };
      }
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey && openaiKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "OpenAI (Env Fallback)",
          providerName: "openai",
          apiKey: openaiKey.trim(),
          isActive: true,
          modelName: "gpt-4o-mini",
          type: "generative",
          maxContext: 128000,
        };
      }
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey && anthropicKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "Anthropic (Env Fallback)",
          providerName: "anthropic",
          apiKey: anthropicKey.trim(),
          isActive: true,
          modelName: "claude-3-5-sonnet-latest",
          type: "generative",
          maxContext: 200000,
        };
      }
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && groqKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "Groq (Env Fallback)",
          providerName: "groq",
          apiKey: groqKey.trim(),
          isActive: true,
          modelName: "llama-3.3-70b-versatile",
          type: "generative",
          maxContext: 8192,
        };
      }
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (deepseekKey && deepseekKey.trim()) {
        return {
          id: "provider-default-env-fallback",
          name: "DeepSeek (Env Fallback)",
          providerName: "deepseek",
          apiKey: deepseekKey.trim(),
          isActive: true,
          modelName: "deepseek-chat",
          type: "generative",
          maxContext: 64000,
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
          maxContext: 32768,
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
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS provider_mappings (
          task TEXT PRIMARY KEY,
          providerInstanceId TEXT NOT NULL
        )
      `,
      ).run();
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
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS provider_mappings (
          task TEXT PRIMARY KEY,
          providerInstanceId TEXT NOT NULL
        )
      `,
      ).run();
      if (!providerInstanceId) {
        db.prepare(`DELETE FROM provider_mappings WHERE task = ?`).run(task);
      } else {
        db.prepare(
          `
          INSERT INTO provider_mappings (task, providerInstanceId)
          VALUES (?, ?)
          ON CONFLICT(task) DO UPDATE SET providerInstanceId = excluded.providerInstanceId
        `,
        ).run(task, providerInstanceId);
      }
    } finally {
      db.close();
    }
  }
}
