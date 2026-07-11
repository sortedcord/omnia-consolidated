import { z } from "zod";
import {
  Entity,
  WorldState,
  naturalizeTime,
  serializeSubjectiveWorldState,
} from "@omnia/core";
import {
  BufferEntry,
  BufferRepository,
  serializeSubjectiveBufferEntry,
  LedgerEntry,
  LedgerRepository,
} from "@omnia/memory";

/**
 * Zod schema for the structured response expected from the actor LLM.
 *
 * The actor emits free narrative prose describing what it does next. This
 * prose is subsequently fed into the IntentDecoder, which splits and
 * classifies it into dialogue / action / monologue intents. Keeping the
 * actor's output as prose (rather than a structured intent sequence) lets
 * us reuse the entire existing decode pipeline unchanged.
 */
export const ActorResponseSchema = z.object({
  narrativeProse: z.string(),
});
export type ActorResponse = z.infer<typeof ActorResponseSchema>;

/**
 * Builds the LLM prompt for an entity to act immersively in the world.
 *
 * The prompt is strictly epistemically bounded: the entity only sees what
 * it is allowed to see (public attributes + private attributes explicitly
 * ACL'd to it), its own recent memory buffer, and the entities co-located
 * with it. System UUIDs are surfaced as subjective aliases.
 */
export class ActorPromptBuilder {
  /**
   * @param bufferRepo  Used to fetch the actor's recent memory. Optional —
   *                    if absent, the memory section is omitted.
   * @param ledgerRepo  Used to fetch long-term memories. Optional.
   * @param memoryLimit Maximum number of recent buffer entries to inject.
   *                    Defaults to 20.
   * @param ledgerLimit Maximum number of long-term memories to retrieve.
   *                    Defaults to 5.
   */
  constructor(
    private bufferRepo?: BufferRepository,
    private ledgerRepo?: LedgerRepository,
    private memoryLimit = 20,
    private ledgerLimit = 5,
  ) {}

  /**
   * Assembles the system prompt and user context for a given entity.
   */
  build(
    worldState: WorldState,
    entity: Entity,
  ): { systemPrompt: string; userContext: string } {
    const systemPrompt = this.buildSystemPrompt();
    const userContext = this.buildUserContext(worldState, entity);
    return { systemPrompt, userContext };
  }

  private buildSystemPrompt(): string {
    return `
You are an actor agent embodying a single character in a narrative simulation. You ARE this character: act immersively, naturally, and in-character at all times. Do not break character, do not reference being an AI or a system, and do not narrate from outside the character's perspective.

Your output is a short block of narrative prose describing what your character does, says, or thinks next. You may:
- Speak aloud → Other entities can hear it if they are present nearby. (Or nobody will hear it if you are alone)
- Perform a physical action → It is subject to the world's physics and logic. Do not describe the outcome of your action.
- Think internally / reflect / feel → this is a "monologue". NO ONE else perceives it. This is what you think internally.

Guidelines:
- Always write in the first person
- Only describe your character's own actions, spoken words, and internal reactions. Do NOT narrate or describe the environment or your surroundings, or other characters' actions.
- Refer to other entities by the subjective names/aliases that you refer to them as.
- Keep your prose vivid but concise. Write it in natural narrative order.
- Not every response requires an outward action. It is perfectly valid to only think (a monologue) and do nothing perceivable.
- Never speak or act on another entity's behalf. You only control your own character.
- Stay strictly within what your character knows. Do not invent knowledge that doesn't exist or act on it.
- You are limited by just your memory. If your memory is limited, then that's all you can remember. If you do make stuff up then that's lying. Which is allowed, but remember that you're lying.
".
`.trim();
  }

  private buildUserContext(worldState: WorldState, entity: Entity): string {
    const sections: string[] = [];
    const now = worldState.clock.get();

    // --- Subjective present time ---
    sections.push(
      `=== CURRENT MOMENT ===\nIt is ${now.toISOString()} right now.`,
    );

    // --- Subjective world state (self + perceived entities + co-location) ---
    sections.push(
      `=== THE WORLD AS YOU PERCEIVE IT ===\n${serializeSubjectiveWorldState(worldState, entity.id)}`,
    );

    // Fetch recent buffer entries once
    let recentEntries: BufferEntry[] = [];
    if (this.bufferRepo) {
      try {
        recentEntries = this.bufferRepo.listForOwner(entity.id);
      } catch {}
    }

    // --- Recent memory ---
    const memorySection = this.buildMemorySection(entity, recentEntries, now);
    if (memorySection) {
      sections.push(memorySection);
    }

    // --- Recalled Long-Term memory ---
    const ledgerSection = this.buildLedgerSection(
      worldState,
      entity,
      recentEntries,
      now,
    );
    if (ledgerSection) {
      sections.push(ledgerSection);
    }

    return sections.join("\n\n");
  }

  private buildMemorySection(
    entity: Entity,
    entries: BufferEntry[],
    now: Date,
  ): string | null {
    if (!this.bufferRepo) return null;

    if (entries.length === 0) {
      return `=== RECENT EVENTS ===\n(No recent events recorded.)`;
    }

    const recent = entries.slice(-this.memoryLimit);
    const groupedLines: string[] = [];
    let currentGroup: string | null = null;

    for (const entry of recent) {
      const serialized = serializeSubjectiveBufferEntry(entry, entity);
      const when = naturalizeTime(now, new Date(entry.timestamp));

      if (when !== currentGroup) {
        currentGroup = when;
        const header = when.charAt(0).toUpperCase() + when.slice(1);
        groupedLines.push(header);
      }

      groupedLines.push(`  - ${serialized}`);
    }

    return `=== RECENT EVENTS ===\n${groupedLines.join("\n")}`;
  }

  private buildLedgerSection(
    worldState: WorldState,
    entity: Entity,
    recentBuffer: BufferEntry[],
    now: Date,
  ): string | null {
    if (!this.ledgerRepo) return null;

    // 1. Get co-located entities (in the same location as entity)
    const coLocatedEntityIds: string[] = [];
    if (entity.locationId) {
      for (const e of worldState.entities.values()) {
        if (e.id !== entity.id && e.locationId === entity.locationId) {
          coLocatedEntityIds.push(e.id);
        }
      }
    }

    // 2. Compute Active Focus entities based on recent interactions (last 10 entries)
    const activeFocus = new Set<string>();
    const maxFocus = 3;

    // We scan the recent buffer entries to see who we recently talked to or who talked to us
    for (let i = recentBuffer.length - 1; i >= 0; i--) {
      const entry = recentBuffer[i];
      const intent = entry.intent;

      if (
        intent.actorId !== entity.id &&
        coLocatedEntityIds.includes(intent.actorId)
      ) {
        activeFocus.add(intent.actorId);
      }
      for (const targetId of intent.targetIds) {
        if (targetId !== entity.id && coLocatedEntityIds.includes(targetId)) {
          activeFocus.add(targetId);
        }
      }
      if (activeFocus.size >= maxFocus) break;
    }

    // If co-located entities is small, auto-focus all of them
    if (activeFocus.size < maxFocus && coLocatedEntityIds.length <= maxFocus) {
      for (const id of coLocatedEntityIds) {
        if (id !== entity.id) {
          activeFocus.add(id);
        }
      }
    }

    const activeFocusIds = Array.from(activeFocus);

    // 3. Retrieve memories using Active Focus
    let recalled: LedgerEntry[];
    try {
      recalled = this.ledgerRepo.retrieve(
        entity.id,
        entity.locationId,
        activeFocusIds,
        undefined, // no query embedding for now (Recency + Importance ranking)
        now,
        this.ledgerLimit,
        { includeAssociativeNeighbors: true },
      );
    } catch {
      return null;
    }

    if (recalled.length === 0) return null;

    // 4. Format them identical to the recent memory format
    const groupedLines: string[] = [];
    let currentGroup: string | null = null;

    for (const entry of recalled) {
      const when = naturalizeTime(now, new Date(entry.timestamp));

      let content = entry.content;
      // Resolve system IDs to subjective aliases in the content
      for (const targetId of entry.involvedEntityIds) {
        const alias = entity.aliases.get(targetId) ?? targetId;
        content = content.replace(new RegExp(targetId, "g"), alias);
      }
      if (entry.locationId) {
        content += ` (at ${entry.locationId})`;
      }

      if (when !== currentGroup) {
        currentGroup = when;
        const header = when.charAt(0).toUpperCase() + when.slice(1);
        groupedLines.push(header);
      }

      groupedLines.push(`  - ${content}`);
      if (entry.quotes && entry.quotes.length > 0) {
        for (const quote of entry.quotes) {
          groupedLines.push(`    Quote: "${quote}"`);
        }
      }
    }

    return `=== YOUR MEMORIES ===\n${groupedLines.join("\n")}`;
  }
}
