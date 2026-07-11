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
   * @param memoryLimit Maximum number of recent buffer entries to inject.
   *                    Defaults to 20.
   */
  constructor(
    private bufferRepo?: BufferRepository,
    private memoryLimit = 20,
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
- Think internally / reflect / feel → this is a "monologue". NO ONE else perceives it. This is what you think internally, maybe about another event or something that just happened to you.

Guidelines:
- Always write in the first person (e.g., "I do this", "I say", "I think").
- Only describe your character's own actions, spoken words, and internal reactions. Do NOT narrate or describe the environment or your surroundings, or other characters' actions.
- Stay strictly within what your character knows. Do not invent knowledge that doesn't exist or act on it.
- Refer to other entities by the subjective names/aliases that you refer to them as.
- Keep your prose vivid but concise. Write it in natural narrative order.
- Not every response requires an outward action. It is perfectly valid to only think (a monologue) and do nothing perceivable.
- Never speak or act on another entity's behalf. You only control your own character.
".
`.trim();
  }

  private buildUserContext(worldState: WorldState, entity: Entity): string {
    const sections: string[] = [];

    // --- Subjective present time ---
    const now = worldState.clock.get();
    sections.push(
      `=== CURRENT MOMENT ===\nIt is ${now.toISOString()} right now.`,
    );

    // --- Subjective world state (self + perceived entities + co-location) ---
    sections.push(
      `=== THE WORLD AS YOU PERCEIVE IT ===\n${serializeSubjectiveWorldState(worldState, entity.id)}`,
    );

    // --- Recent memory ---
    const memorySection = this.buildMemorySection(
      entity,
      worldState.clock.get(),
    );
    if (memorySection) {
      sections.push(memorySection);
    }

    return sections.join("\n\n");
  }

  private buildMemorySection(entity: Entity, now: Date): string | null {
    if (!this.bufferRepo) return null;

    let entries: BufferEntry[];
    try {
      entries = this.bufferRepo.listForOwner(entity.id);
    } catch {
      return null;
    }

    if (entries.length === 0) {
      return `=== YOUR RECENT MEMORY ===\n(You have no memories yet.)`;
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

    return `=== YOUR RECENT MEMORY ===\n${groupedLines.join("\n")}`;
  }
}
