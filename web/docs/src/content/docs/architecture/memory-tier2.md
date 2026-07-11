---
title: Tier 2 Memory (Ledger)
description: Long-term episodic memory storage and retrieval
---

Tier 2 memory lives in between the memory buffer and tier 3 dossiers and arguably takes up the largest share of the context pie.

Tier 2 memory (or long-term memory) stores historical events that happened to the entity in the past. It acts as an episodic ledger.

```ts
interface LedgerEntry {
  id: string;
  ownerId: string; // whose subjective memory this belongs to
  timestamp: string; // ISO, tied to WorldClock when the intent causing the event happened.
  locationId: string | null; // where it happened
  involvedEntityIds: string[]; // who else this event concerns

  content: string; // third-person narrative summary — recallable
  quotes: string[]; // verbatim lines, only for high-salience dialogue
  importance: number; // 1–10, salience assigned at handoff
  embedding: number[]; // for semantic search (storage representation TBD at build time)
}
```

### Storage Model

Tier 2 memory is stored in relational tables to allow efficient deterministic filtering. Embeddings are stored as raw BLOBs (containing a serialized `Float32Array`). 

To avoid the build and installation friction associated with native C-extensions like `sqlite-vec` (e.g. node-gyp issues across platforms), index optimization relies on standard SQLite secondary indices. These indices allow database queries to execute in microseconds, even with hundreds of thousands of memories:

```sql
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
```

### Handoff (Deferred)

The process of moving memories from the Tier 1 working buffer into Tier 2 is called **Handoff**. 
During handoff, an LLM chunk-summarizes raw buffer events, extracts salient quotes, and assigns an `importance` score (1-10). Routine actions score low, while life-altering events score high.

Because this summarization requires an LLM call, it utilizes the standard `LLMProviderInstance` inference provider routing architecture just like all other callers in the system. This allows the simulation to route handoff processing to a specific model.

*Note: The automated handoff pipeline is currently deferred for future implementation.*

### Retrieval Architecture

Retrieval happens in phases to manage context window limits without running expensive vector searches across an entity's entire lifetime of memories.

#### Phase 1: Deterministic Heuristic Filtering

This is the primary database-level retrieval mechanism. We use fast SQL queries to filter down to a relevant candidate pool based on immediate context:

1. **Spatial Cues**: Fetch recent memories where `location_id` equals the entity's current location.
2. **Social Cues**: Fetch recent memories involving the `involvedEntityIds` currently in the entity's perception radius.
3. **High Salience**: Always fetch memories with `importance >= 8` regardless of spatial or social context.

#### Phase 2: Semantic & Episodic Ranking

This phase runs in application memory using the candidates returned from Phase 1:

1. **Semantic Match**: Compute cosine similarity dynamically in JS/TS memory over the candidate pool (limit 100). Since Phase 1 narrows the pool down significantly, vector comparisons are highly performant in JS, eliminating the need for native vector database extensions.
2. **Scoring Combination**: Combine recency, importance, and semantic match:
   $$\text{Score} = (\text{recencyWeight} \times \text{recency}) + (\text{importanceWeight} \times \text{importanceNorm}) + (\text{relevanceWeight} \times \text{relevance})$$
   Where `recency` uses an exponential decay based on elapsed hours ($\text{decayRate}^{\text{hoursElapsed}}$).
3. **Associative Chain**: When a memory is selected, automatically pull in its immediate chronological neighbors (preceding and succeeding ledger entries) to preserve episodic continuity (mirroring how remembering one event triggers the memory of what happened right after).

### Retrieval Triggers & Active Focus

In crowded locations (e.g. a tavern with 15 other characters), retrieving memories for all co-located entities simultaneously would cause **context explosion**. To prevent this, Omnia utilizes an **Active Focus** trigger strategy:

- **Active Focus Scanning**: The prompt builder scans the last 10 entries of the entity's recent working memory (Tier 1 Buffer). Any character that the actor has recently spoken to, thought about, or was targeted by is placed in the "Active Focus" set.
- **Dynamic Thresholding**: 
  - If the number of co-located entities is small ($\le 3$), long-term memory is retrieved for all of them.
  - If the location is crowded ($> 3$ entities), the system **strictly** limits long-term retrieval to the top 3 characters in "Active Focus".
- This creates a natural attention loop. When a new character interacts with the actor, they immediately enter "Active Focus" in the buffer, triggering the retrieval of their long-term history on the subsequent turn.

### Integration into Prompts

Recalled entries are formatted into the prompt using chronological relative time grouping. System-level metrics like salience/importance scores are omitted to preserve immersion, and system UUIDs are mapped to subjective aliases.

To frame the prompt naturally:
1. Tier 1 working buffer entries are presented under the header `=== RECENT EVENTS ===`, referring strictly to events happening in the present narrative context.
2. Tier 2 recalled entries are presented under the header `=== YOUR MEMORIES ===`, framing them simply as the entity's memories.

```text
=== RECENT EVENTS ===
Moments ago
  - you spoke to Strider: "Hello there"

=== YOUR MEMORIES ===
A couple days ago
  - You met a hooded figure named Strider at The Prancing Pony.
    Quote: "I can avoid being seen, if I wish, but to disappear entirely, that is a rare gift."
```
