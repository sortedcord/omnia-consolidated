import type { ModelProviderInstance } from "./llm.js";
import { getDb } from "./db.js";
import { mapRow, type DbRow } from "./row-mapper.js";

export { setDbPath as setDbPathOverride } from "./db.js";

export class ProviderManager {
  static list(): ModelProviderInstance[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM provider_instances")
      .all() as DbRow[];
    return rows.map(mapRow);
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
    const db = getDb();
    const id = "provider-" + Date.now();
    const activeCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM provider_instances WHERE isActive = 1 AND type = ?",
      )
      .get(type) as { count: number };
    const isActive = activeCount.count === 0 ? 1 : 0;

    const actualMaxContext =
      maxContext !== undefined ? maxContext : type === "generative" ? 32768 : 0;

    db.prepare(
      `INSERT INTO provider_instances (id, name, providerName, apiKey, isActive, modelName, type, maxContext, endpointUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }

  static delete(id: string): void {
    const db = getDb();
    const provider = db
      .prepare("SELECT isActive, type FROM provider_instances WHERE id = ?")
      .get(id) as { isActive: number; type: string } | undefined;
    db.prepare("DELETE FROM provider_instances WHERE id = ?").run(id);

    if (provider && provider.isActive === 1) {
      const next = db
        .prepare("SELECT id FROM provider_instances WHERE type = ? LIMIT 1")
        .get(provider.type) as { id: string } | undefined;
      if (next) {
        db.prepare(
          "UPDATE provider_instances SET isActive = 1 WHERE id = ?",
        ).run(next.id);
      }
    }
  }

  static setActive(id: string): void {
    const db = getDb();
    const target = db
      .prepare("SELECT type FROM provider_instances WHERE id = ?")
      .get(id) as { type: string } | undefined;
    if (target) {
      db.prepare(
        "UPDATE provider_instances SET isActive = 0 WHERE type = ?",
      ).run(target.type);
      db.prepare("UPDATE provider_instances SET isActive = 1 WHERE id = ?").run(
        id,
      );
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
    const db = getDb();
    const actualMaxContext =
      maxContext !== undefined ? maxContext : type === "generative" ? 32768 : 0;

    if (apiKey && apiKey.trim()) {
      db.prepare(
        `UPDATE provider_instances
         SET name = ?, providerName = ?, apiKey = ?, modelName = ?, type = ?, maxContext = ?, endpointUrl = ?
         WHERE id = ?`,
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
        `UPDATE provider_instances
         SET name = ?, providerName = ?, modelName = ?, type = ?, maxContext = ?, endpointUrl = ?
         WHERE id = ?`,
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
  }

  static getActive(
    type: "generative" | "embedding" = "generative",
  ): ModelProviderInstance | null {
    const db = getDb();
    try {
      const row = db
        .prepare(
          "SELECT * FROM provider_instances WHERE isActive = 1 AND type = ?",
        )
        .get(type) as DbRow | undefined;

      if (row) {
        return mapRow(row);
      }

      const firstRow = db
        .prepare("SELECT * FROM provider_instances WHERE type = ? LIMIT 1")
        .get(type) as DbRow | undefined;

      if (firstRow) {
        db.prepare(
          "UPDATE provider_instances SET isActive = 1 WHERE id = ?",
        ).run(firstRow.id);
        return mapRow(firstRow);
      }

      return null;
    } catch {
      return null;
    }
  }

  static getMappings(): Record<string, string> {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM provider_mappings").all() as {
      task: string;
      providerInstanceId: string;
    }[];
    const mappings: Record<string, string> = {};
    for (const row of rows) {
      mappings[row.task] = row.providerInstanceId;
    }
    return mappings;
  }

  static setMapping(task: string, providerInstanceId: string): void {
    const db = getDb();
    if (!providerInstanceId) {
      db.prepare("DELETE FROM provider_mappings WHERE task = ?").run(task);
    } else {
      db.prepare(
        `INSERT INTO provider_mappings (task, providerInstanceId)
         VALUES (?, ?)
         ON CONFLICT(task) DO UPDATE SET providerInstanceId = excluded.providerInstanceId`,
      ).run(task, providerInstanceId);
    }
  }
}
