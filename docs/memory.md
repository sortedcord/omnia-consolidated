# Memory & Subjective Aliases

This document outlines the memory subsystem (`packages/memory`) and the v0 Subjective Alias System. The goal is to enforce epistemic privacy while allowing the LLM-driven components (NPC agents and decoders) to translate naturally between system-level IDs and human-readable narrative context.

---

## 1. Subjective Alias System (v0)

System-level IDs (e.g. `alice`, `bob`, or UUIDs) are critical for state tracking, but placing them directly in prompts violates epistemic privacy and breaks narrative generation (as models make up inconsistent names or fail to match references).

To solve this, each `Entity` class (in [entity.ts](file:///home/sortedcord/Projects/omnia_umbrella/omnia/packages/core/src/entity.ts)) maintains a private **Subjective Alias Map**:
```typescript
class Entity extends AttributableObject {
  locationId: string | null = null;
  readonly aliases: Map<string, string> = new Map();
  // Key: target entity ID (e.g., "bob")
  // Value: subjective string (e.g., "the hooded figure" or "Gareth")
}
```

### Alias States
* **Unknown Name**: The entity does not know the target's real name. The alias defaults to a subjective label derived from the target's visible description/attributes (e.g., `"the hooded figure"`). This label is used in both internal thoughts and external dialogues.
* **Known Name**: The entity has learned the target's name. The alias is updated to their name (e.g., `"Gareth"`).

### How It Wires Into Prompts
* **Intent Decoder**: When decoding narrative prose written by actor `X`, we pass `X`'s alias map to the LLM. This allows the decoder to map subjective labels like *"the hooded figure"* back to the correct system ID `bob`.
* **Prompt Injection**: When injecting world state, events, or memories into an NPC's prompt context, the system replaces raw target IDs with the subjective aliases defined in that NPC's alias map.

### SQLite Persistence
Entity aliases are persisted in the `objects` table via the `aliases_json TEXT` column in [repository.ts](file:///home/sortedcord/Projects/omnia_umbrella/omnia/packages/core/src/repository.ts). The aliases map is stringified as JSON entries on save and parsed back upon entity reconstitution in `SQLiteRepository.loadEntity()`, `loadWorldState()`, and `listEntities()`.

---

## 2. Subjective Buffer Entry

A subjective `BufferEntry` records a discrete event from the perspective of an entity (the `owner`). It wraps a structured `Intent` (reused as-is to prevent schema drift) and appends execution metadata. The interface is defined and exported from [buffer.ts](file:///home/sortedcord/Projects/omnia_umbrella/omnia/packages/memory/src/buffer.ts).

### The Shape of a Buffer Entry
```typescript
interface BufferEntry {
  id: string;
  ownerId: string;       // Whose subjective memory buffer this lives in
  timestamp: string;     // WorldClock.get().toISOString() at write time
  locationId: string | null; // Actor's location when this happened

  intent: Intent;        // The actual dialogue/action intent, reused as-is
  outcome?: {            // Present only for "action" intents processed by the Architect
    isValid: boolean;
    reason: string;
  };
}
```

* **Intent Reuse**: By wrapping the `Intent` directly, any future schema changes to `Intent` flow down automatically without duplicating code.
* **Write-time Location**: `locationId` is captured immediately when writing the entry (rather than computed dynamically later), matching the schema of long-term `LedgerEntry` consolidation.

---

## 3. Buffer Serialization (Epistemic Substitute)

To prevent leaking system IDs or universal state to NPCs, we serialize buffer memories using a decoupled, viewer-relative function `serializeSubjectiveBufferEntry` in [buffer.ts](file:///home/sortedcord/Projects/omnia_umbrella/omnia/packages/memory/src/buffer.ts).

To safely resolve actor and target entities without leaking internal UUIDs, we use the `resolveAlias` helper:
```typescript
export function resolveAlias(viewer: Entity, targetId: string): string {
  if (targetId === viewer.id) return "you";
  return viewer.aliases.get(targetId) ?? "an unfamiliar figure";
}
```

This helper maps:
- Self-references (when an entity evaluates their own memory) to `"you"`.
- Known targets to their subjective name/descriptor from the alias map.
- Unknown targets to a generic `"an unfamiliar figure"`.

The primary serialization function consumes this helper:
```typescript
export function serializeSubjectiveBufferEntry(
  entry: BufferEntry, 
  viewer: Entity
): string {
  const dateObj = new Date(entry.timestamp);
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour12: true, timeZone: "UTC" });
  const actorAlias = resolveAlias(viewer, entry.intent.actorId);
  
  const targetAliases = entry.intent.targetIds.map(
    (tid) => resolveAlias(viewer, tid)
  );

  let details: string;
  if (entry.intent.type === "dialogue") {
    details = `spoke to ${targetAliases.join(", ") || "someone"}: "${entry.intent.description}"`;
  } else {
    details = `${entry.intent.description}`;
    if (entry.outcome) {
      details += ` (Outcome: ${entry.outcome.isValid ? "Succeeded" : `Failed - ${entry.outcome.reason}`})`;
    }
  }

  return `[${timeStr}] ${actorAlias} ${details}`;
}
```

This guarantees that the prompt reads cleanly (e.g. `[12:03:00 PM] the hooded figure opened the wooden chest (Outcome: Succeeded)` or `[12:03:00 PM] you spoke to an unfamiliar figure...`) without exposing raw system IDs to the NPC.

---

## 4. SQLite Persistence & BufferRepository

The `BufferRepository` class in [buffer.ts](file:///home/sortedcord/Projects/omnia_umbrella/omnia/packages/memory/src/buffer.ts) utilizes the same SQLite database as core repositories:

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

* **JSON Storage**: `intent` and `outcome` are serialized/deserialized as raw JSON. Because they are validated by Zod at creation time, they bypass redundant validation checks during database roundtrips.
* **Cascade Deletes**: The table is configured with a foreign key referencing the `objects` table (`ON DELETE CASCADE`), ensuring that deleting an entity cleanses all their associated subjective memory entries automatically.
