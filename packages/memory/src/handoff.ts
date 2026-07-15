import { z } from "zod";
import { Entity, naturalizeTime } from "@omnia/core";
import {
  BufferEntry,
  serializeSubjectiveBufferEntry,
  BufferRepository,
} from "./buffer.js";
import { LedgerEntry, LedgerRepository } from "./ledger.js";
import { ILLMProvider, IEmbeddingProvider } from "@omnia/llm";

export const HandoffChunkSchema = z.object({
  sourceEntryIds: z.array(z.string()), // buffer rows this chunk consumes
  content: z.string(), // third-person summary -> LedgerEntry.content
  quotes: z.array(z.string()), // verbatim, high-salience lines only
  importance: z.number().int().min(1).max(10),
  involvedEntityIds: z.array(z.string()),
  retainInBuffer: z.boolean(), // "pin"
});

export const HandoffResultSchema = z.object({
  chunks: z.array(HandoffChunkSchema),
});

export type HandoffResult = z.infer<typeof HandoffResultSchema>;
export type HandoffTrigger = "none" | "voluntary" | "involuntary";

/**
 * Serializes the hypothetical memory section for size checking.
 */
export function getMemorySectionLength(
  entity: Entity,
  entries: BufferEntry[],
  now: Date,
): number {
  if (entries.length === 0) {
    return `=== RECENT EVENTS ===\n(No recent events recorded.)`.length;
  }

  const groupedLines: string[] = [];
  let currentGroup: string | null = null;

  for (const entry of entries) {
    const serialized = serializeSubjectiveBufferEntry(entry, entity);
    const when = naturalizeTime(now, new Date(entry.timestamp));

    if (when !== currentGroup) {
      currentGroup = when;
      const header = when.charAt(0).toUpperCase() + when.slice(1);
      groupedLines.push(header);
    }

    groupedLines.push(`  - ${serialized}`);
  }

  return `=== RECENT EVENTS ===\n${groupedLines.join("\n")}`.length;
}

function checkSceneExit(entity: Entity, bufferEntries: BufferEntry[]): boolean {
  if (bufferEntries.length === 0) return false;

  // Find the location of the most recent buffer entries
  const lastEntry = bufferEntries[bufferEntries.length - 1];
  if (
    lastEntry.locationId &&
    entity.locationId &&
    lastEntry.locationId !== entity.locationId
  ) {
    return true;
  }

  // Also check if there are entries from different locations in the buffer
  const locations = new Set(
    bufferEntries.map((e) => e.locationId).filter((loc) => loc !== null),
  );
  if (locations.size > 1) {
    return true;
  }

  return false;
}

function checkIdleDecay(bufferEntries: BufferEntry[]): boolean {
  const N = 5; // N consecutive idle turns
  if (bufferEntries.length < N) return false;

  // Check the last N entries
  const lastN = bufferEntries.slice(-N);
  return lastN.every((e) => e.intent.type === "monologue");
}

function checkAttributeTrigger(entity: Entity): boolean {
  const consciousness = entity.attributes.get("consciousness");
  if (
    consciousness &&
    consciousness.getValue().toLowerCase() === "unconscious"
  ) {
    return true;
  }

  const status = entity.attributes.get("status");
  if (
    status &&
    ["unconscious", "asleep", "dead", "inactive"].includes(
      status.getValue().toLowerCase(),
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Checks deterministically whether handoff should run for the given entity.
 */
export function checkHandoffTrigger(
  entity: Entity,
  bufferEntries: BufferEntry[],
  now: Date,
  maxContext: number = 32768,
): HandoffTrigger {
  if (bufferEntries.length === 0) {
    return "none";
  }

  // Involuntary triggers first (hard)
  if (maxContext > 0) {
    const memoryLength = getMemorySectionLength(entity, bufferEntries, now);
    const charCeiling = maxContext * 4 * 0.6;
    if (memoryLength > charCeiling) {
      return "involuntary";
    }
  }

  // Event velocity
  if (bufferEntries.length > 20) {
    return "involuntary";
  }

  // Voluntary triggers (soft)
  if (checkSceneExit(entity, bufferEntries)) {
    return "voluntary";
  }

  if (checkIdleDecay(bufferEntries)) {
    return "voluntary";
  }

  if (checkAttributeTrigger(entity)) {
    return "voluntary";
  }

  return "none";
}

/**
 * Splits the buffer into candidate pool (older) and watermark tail (untouched).
 */
export function splitBufferForHandoff(
  bufferEntries: BufferEntry[],
  now: Date,
  K: number = 8,
): { candidates: BufferEntry[]; watermark: BufferEntry[] } {
  const sorted = [...bufferEntries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const freshBuckets = new Set([
    "just now",
    "moments ago",
    "a few minutes ago",
    "several minutes ago",
  ]);

  let watermarkStartIndex: number;

  // 1. Mark last K entries as watermark
  if (sorted.length > K) {
    watermarkStartIndex = sorted.length - K;
  } else {
    watermarkStartIndex = 0;
  }

  // 2. Expand watermark to include any fresh entries before it
  for (let i = watermarkStartIndex - 1; i >= 0; i--) {
    const bucket = naturalizeTime(now, new Date(sorted[i].timestamp));
    if (freshBuckets.has(bucket)) {
      watermarkStartIndex = i;
    } else {
      break;
    }
  }

  return {
    candidates: sorted.slice(0, watermarkStartIndex),
    watermark: sorted.slice(watermarkStartIndex),
  };
}

/**
 * HandoffEngine processes memory handoffs using LLM summarization and DB transactions.
 */
export class HandoffEngine {
  constructor(
    private llmProvider: ILLMProvider,
    private embedProvider: IEmbeddingProvider,
    private bufferRepo: BufferRepository,
    private ledgerRepo: LedgerRepository,
  ) {}

  async runHandoff(
    entity: Entity,
    bufferEntries: BufferEntry[],
    now: Date,
  ): Promise<boolean> {
    const { candidates } = splitBufferForHandoff(bufferEntries, now);

    if (candidates.length === 0) {
      return false;
    }

    const candidatesList = candidates
      .map((entry) => {
        const serialized = serializeSubjectiveBufferEntry(entry, entity);
        return `ID: ${entry.id} | Timestamp: ${entry.timestamp} | Location: ${entry.locationId || "None"}\nContent: ${serialized}`;
      })
      .join("\n---\n");

    const systemPrompt = `
You are the memory Handoff Engine. Your task is to process a list of recent working memory buffer entries for an entity and select which memories to promote to the long-term Ledger, and which to forget or summarize.

Instructions:
1. **Cluster** related consecutive buffer entries into high-level narrative beats or events (e.g. a full back-and-forth conversation or a single physical action and its outcome). Combine them into a single summary chunk.
2. **Write in the third-person** for the "content" of each chunk (e.g. "John asked Mary for the key, and Mary reluctantly handed it over").
3. **verbatim Quotes**: Extract verbatim, high-salience quotes from dialogue if relevant. Do not modify or invent quotes.
4. **Determine Importance**: Assign an importance score from 1 (trivial, e.g. waking up) to 10 (life-altering, e.g. witnessing a crime).
5. **Involved Entities**: Identify all entity IDs involved in the memories in this chunk.
6. **Retain in Buffer (Pinning)**: If a beat represents an unresolved high-stakes situation (e.g. a standing threat, an unanswered accusation, an ongoing chase or conflict), set "retainInBuffer" to true so it remains in the working memory buffer for immediate context. Otherwise, set it to false so it is safely pruned from the buffer.
7. **Exclude stage business**: Glances, sighs, ambient noticing, and irrelevant sensory details should be ignored and not included in any promoted chunk. They will be forgotten.
8. **Forget by omission**: Any buffer entry ID that you do not include in any chunk's "sourceEntryIds" will be permanently deleted and forgotten.
`.trim();

    const userContext = `
Subject Entity ID: ${entity.id}
Current Time: ${now.toISOString()}

Working Memory Candidates for Handoff:
${candidatesList}
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: HandoffResultSchema,
    });

    if (!response.success || !response.data) {
      return false;
    }

    const result = response.data;
    const db = (
      this.bufferRepo as unknown as {
        db: { transaction: (fn: () => void) => void };
      }
    ).db;

    const ledgerEntries: LedgerEntry[] = [];
    for (const chunk of result.chunks) {
      let embedding: number[];
      try {
        embedding = await this.embedProvider.embed(chunk.content);
      } catch (err) {
        console.error("Failed to generate embedding for handoff chunk:", err);
        return false;
      }

      ledgerEntries.push({
        id:
          "ledger-" +
          Math.random().toString(36).substr(2, 9) +
          "-" +
          Date.now(),
        ownerId: entity.id,
        timestamp: now.toISOString(),
        locationId: entity.locationId,
        involvedEntityIds: chunk.involvedEntityIds,
        content: chunk.content,
        quotes: chunk.quotes,
        importance: chunk.importance,
        embedding,
      });
    }

    try {
      db.transaction(() => {
        // Save promoted ledger entries
        for (const entry of ledgerEntries) {
          this.ledgerRepo.save(entry);
        }

        // Keep track of pinned source IDs
        const pinnedSourceIds = new Set<string>();
        for (const chunk of result.chunks) {
          if (chunk.retainInBuffer) {
            for (const id of chunk.sourceEntryIds) {
              pinnedSourceIds.add(id);
            }
          }
        }

        // Delete or pin entries
        for (const candidate of candidates) {
          if (pinnedSourceIds.has(candidate.id)) {
            const updated = { ...candidate, pinned: true };
            this.bufferRepo.save(updated);
          } else {
            this.bufferRepo.delete(candidate.id);
          }
        }
      })();
      return true;
    } catch (err) {
      console.error("Transaction failed during handoff execution:", err);
      return false;
    }
  }
}
