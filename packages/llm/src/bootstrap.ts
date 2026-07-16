import type BetterSqlite3 from "better-sqlite3";
import { ProviderRegistry } from "./registry.js";

export function seedFromEnvVars(db: BetterSqlite3.Database): boolean {
  const totalCount = db
    .prepare("SELECT COUNT(*) as count FROM provider_instances")
    .get() as { count: number };
  if (totalCount.count > 0) {
    return false;
  }

  let hasActiveGenerative = false;
  let hasActiveEmbedding = false;

  const insertStmt = db.prepare(
    `INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertMany = db.transaction(
    (
      entries: {
        id: string;
        name: string;
        providerId: string;
        key: string;
        isActive: number;
        modelName: string;
        type: "generative" | "embedding";
        maxContext: number;
      }[],
    ) => {
      for (const e of entries) {
        insertStmt.run(
          e.id,
          e.name,
          e.providerId,
          e.key,
          e.isActive,
          e.modelName,
          e.type,
          e.maxContext,
        );
      }
    },
  );

  const entries: {
    id: string;
    name: string;
    providerId: string;
    key: string;
    isActive: number;
    modelName: string;
    type: "generative" | "embedding";
    maxContext: number;
  }[] = [];

  for (const def of ProviderRegistry.all()) {
    if (!def.envVar) continue;
    const key = process.env[def.envVar]?.trim();
    if (!key) continue;

    if (def.capabilities.generative) {
      entries.push({
        id: `provider-default-${def.id}`,
        name: `${def.displayName} (Env)`,
        providerId: def.id,
        key,
        isActive: hasActiveGenerative ? 0 : 1,
        modelName: def.defaultModel,
        type: "generative",
        maxContext: def.defaultMaxContext,
      });
      if (!hasActiveGenerative) hasActiveGenerative = true;
    }

    if (def.capabilities.embedding) {
      const embedModel = def.defaultEmbeddingModel || "";
      entries.push({
        id: `provider-default-${def.id}-embed`,
        name: `${def.displayName} Embed (Env)`,
        providerId: def.id,
        key,
        isActive: hasActiveEmbedding ? 0 : 1,
        modelName: embedModel,
        type: "embedding",
        maxContext: 0,
      });
      if (!hasActiveEmbedding) hasActiveEmbedding = true;
    }
  }

  if (entries.length > 0) {
    insertMany(entries);
  }
  return true;
}
