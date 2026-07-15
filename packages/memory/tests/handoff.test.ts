import { describe, test, expect } from "vitest";
import Database from "better-sqlite3";
import { Entity } from "@omnia/core";
import { MockLLMProvider, MockEmbeddingProvider } from "@omnia/llm";
import {
  BufferEntry,
  BufferRepository,
  LedgerRepository,
  checkHandoffTrigger,
  splitBufferForHandoff,
  HandoffEngine,
} from "@omnia/memory";

describe("Memory Handoff Tests (Tier 1)", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  test("splitBufferForHandoff correctly splits based on watermark and fresh buckets", () => {
    const entries: BufferEntry[] = [];

    // Add 12 older entries (older than 30 minutes)
    for (let i = 0; i < 12; i++) {
      const minutesAgo = 60 - i;
      const timestamp = new Date(
        now.getTime() - minutesAgo * 60 * 1000,
      ).toISOString();
      entries.push({
        id: `entry-old-${i}`,
        ownerId: "alice",
        timestamp,
        locationId: "room-1",
        intent: {
          type: "dialogue",
          originalText: `Old event ${i}`,
          description: `does old thing ${i}`,
          actorId: "alice",
          targetIds: ["bob"],
        },
      });
    }

    // Add 4 fresh entries (moments ago / just now)
    const freshTimes = [
      new Date(now.getTime() - 10 * 1000).toISOString(),
      new Date(now.getTime() - 30 * 1000).toISOString(),
      new Date(now.getTime() - 90 * 1000).toISOString(),
      new Date(now.getTime() - 180 * 1000).toISOString(),
    ];

    freshTimes.forEach((timestamp, idx) => {
      entries.push({
        id: `entry-fresh-${idx}`,
        ownerId: "alice",
        timestamp,
        locationId: "room-1",
        intent: {
          type: "dialogue",
          originalText: `Fresh event ${idx}`,
          description: `does fresh thing ${idx}`,
          actorId: "alice",
          targetIds: ["bob"],
        },
      });
    });

    const { candidates, watermark } = splitBufferForHandoff(entries, now, 8);

    expect(watermark.length).toBeGreaterThanOrEqual(8);
    expect(candidates.length).toBe(8);
    expect(candidates[0].id).toBe("entry-old-0");
  });

  test("checkHandoffTrigger detects scene change and idle decay", () => {
    const entity = new Entity("alice");
    entity.locationId = "room-2";

    // Scenario 1: Empty buffer -> no trigger
    expect(checkHandoffTrigger(entity, [], now)).toBe("none");

    // Scenario 2: Scene exit
    const entryAtRoom1: BufferEntry = {
      id: "e-1",
      ownerId: "alice",
      timestamp: now.toISOString(),
      locationId: "room-1",
      intent: {
        type: "dialogue",
        originalText: "hello",
        description: "says hello",
        actorId: "alice",
        targetIds: [],
      },
    };
    expect(checkHandoffTrigger(entity, [entryAtRoom1], now)).toBe("voluntary");

    // Scenario 3: Idle decay (5 consecutive monologues)
    const monologues: BufferEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`,
      ownerId: "alice",
      timestamp: now.toISOString(),
      locationId: "room-2",
      intent: {
        type: "monologue",
        originalText: "think",
        description: "thinks",
        actorId: "alice",
        targetIds: [],
      },
    }));
    expect(checkHandoffTrigger(entity, monologues, now)).toBe("voluntary");
  });

  test("HandoffEngine promotes candidates to Ledger and prunes buffer transactionally", async () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS objects (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL
      );
      INSERT INTO objects (id, type, name) VALUES ('alice', 'character', 'Alice');
    `);

    const bufferRepo = new BufferRepository(db);
    const ledgerRepo = new LedgerRepository(db);

    const entity = new Entity("alice");
    entity.locationId = "room-1";

    const entries: BufferEntry[] = [];
    for (let i = 0; i < 10; i++) {
      const timestamp = new Date(
        now.getTime() - (50 - i) * 60 * 1000,
      ).toISOString();
      const entry: BufferEntry = {
        id: `entry-${i}`,
        ownerId: "alice",
        timestamp,
        locationId: "room-1",
        intent: {
          type: i % 2 === 0 ? "dialogue" : "action",
          originalText: `Event ${i}`,
          description: `does thing ${i}`,
          actorId: "alice",
          targetIds: ["bob"],
        },
      };
      bufferRepo.save(entry);
      entries.push(entry);
    }

    const mockHandoffResult = {
      chunks: [
        {
          sourceEntryIds: ["entry-0"],
          content: "Alice initiated dialogue and performed various tasks.",
          quotes: ["Event 0"],
          importance: 5,
          involvedEntityIds: ["bob"],
          retainInBuffer: false,
        },
      ],
    };

    const llmProvider = new MockLLMProvider([mockHandoffResult]);
    const embedProvider = new MockEmbeddingProvider();
    const engine = new HandoffEngine(
      llmProvider,
      embedProvider,
      bufferRepo,
      ledgerRepo,
    );

    const success = await engine.runHandoff(entity, entries, now);
    expect(success).toBe(true);

    const ledgerRows = db
      .prepare("SELECT * FROM ledger_entries WHERE owner_id = ?")
      .all("alice") as Record<string, unknown>[];
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].content).toBe(
      "Alice initiated dialogue and performed various tasks.",
    );
    expect(JSON.parse(ledgerRows[0].quotes_json)).toEqual(["Event 0"]);
    expect(ledgerRows[0].importance).toBe(5);

    const remainingBuffer = bufferRepo.listForOwner("alice");
    expect(remainingBuffer.length).toBe(8);
    expect(remainingBuffer.map((b) => b.id)).not.toContain("entry-0");
    expect(remainingBuffer.map((b) => b.id)).not.toContain("entry-1");
    expect(remainingBuffer[0].id).toBe("entry-2");
  });
});
