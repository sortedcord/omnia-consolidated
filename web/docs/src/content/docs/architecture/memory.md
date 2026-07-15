---
title: Memory & Subjective Aliases
description: The memory subsystem and how entities refer to each other
---

This document outlines the memory subsystem (`packages/memory`) and the Subjective Alias System.

## Subjective Alias System

System-level IDs (e.g. `alice`, `bob`, or UUIDs) are critical for state tracking, but placing them directly in prompts violates epistemic privacy and breaks narrative generation.

Each `Entity` class maintains a private **Subjective Alias Map**:

```typescript
class Entity extends AttributableObject {
  locationId: string | null = null;
  readonly aliases: Map<string, string> = new Map();
  // Key: target entity ID (e.g., "bob")
  // Value: subjective string (e.g., "the hooded figure" or "Gareth")
}
```

### Alias States

- **Unknown Name**: Defaults to a subjective label derived from the target's visible description (e.g., `"the hooded figure"`).
- **Known Name**: Updated to their name once learned (e.g., `"Gareth"`).

### How It Wires Into Prompts

- **Intent Decoder**: The decoder maps subjective labels like "the hooded figure" back to the correct system ID `bob`.
- **Prompt Injection**: World state, events, and memories are injected with raw target IDs replaced by subjective aliases.

### SQLite Persistence

Entity aliases are persisted in the `objects` table via the `aliases_json TEXT` column. The aliases map is stringified as JSON on save and parsed back upon entity reconstitution.

## Subjective Buffer Entry

A subjective `BufferEntry` records a discrete event from the perspective of an entity (the `owner`). It wraps a structured `Intent` and appends execution metadata.

### The Shape of a Buffer Entry

```typescript
interface BufferEntry {
  id: string;
  ownerId: string; // Whose subjective memory buffer this lives in
  timestamp: string; // WorldClock.get().toISOString() at write time
  locationId: string | null; // Actor's location when this happened

  intent: Intent; // The actual dialogue/action intent, reused as-is
  outcome?: {
    // Present only for "action" intents
    isValid: boolean;
    reason: string;
  };
}
```

- **Intent Reuse**: Schema changes to `Intent` flow down automatically.
- **Write-time Location**: `locationId` is captured immediately when writing the entry.

## Buffer Serialization (Epistemic Substitute)

To prevent leaking system IDs, buffer memories are serialized using `serializeSubjectiveBufferEntry` with the `resolveAlias` helper:

```typescript
export function resolveAlias(viewer: Entity, targetId: string): string {
  if (targetId === viewer.id) return "you";
  return viewer.aliases.get(targetId) ?? "an unfamiliar figure";
}
```

This guarantees prompts read cleanly — e.g. `[12:03:00 PM] the hooded figure opened the wooden chest (Outcome: Succeeded)` — without exposing raw system IDs.

## SQLite Persistence & BufferRepository

The `BufferRepository` class uses the same SQLite database as core repositories:

```sql
CREATE TABLE IF NOT EXISTS buffer_entries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  location_id TEXT,
  intent_json TEXT NOT NULL,
  outcome_json TEXT,
  FOREIGN KEY (owner_id) REFERENCES objects(id) ON DELETE CASCADE
);
```

- **JSON Storage**: `intent` and `outcome` are serialized/deserialized as raw JSON, validated by Zod at creation time.
- **Cascade Deletes**: Deleting an entity removes all associated subjective memory entries.

## Time Naturalization

LLMs are poor at tracking quantized clock times, and real entities do not recall exact timestamps for past events. To make memories psychologically realistic, timestamps are converted into relative natural language phrases prior to prompt injection:

- **Utility**: `naturalizeTime(now: Date, past: Date): string` converts raw dates into subjective relative strings.
- **Granularity Tiers**:
  - **Relative (< 6 hours)**: Returns short offsets like `"just now"`, `"moments ago"`, `"a couple hours ago"`, or `"a few hours ago"`.
  - **Same Subjective Day (6h to 18h)**: Detects waking hours (05:00 - 21:59). If both times occur within the same waking block, it returns `"earlier today, in the {period}"` (where period is `morning`, `afternoon`, or `evening`).
  - **Plausible Sleep Boundaries**: Past events from sleep hours are mapped to `"last night"`, `"around midnight"`, or `"late last night"`.
  - **Coarse (>= 48 hours)**: Returns broad descriptors like `"a couple days ago"`, `"about a week ago"`, `"a couple months ago"`, or `"years ago"`.
