import { WorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { IntentSequence, LLMIntentSequenceSchema } from "./intent.js";

export class IntentDecoder {
  constructor(private llmProvider: ILLMProvider) {}

  /**
   * Decodes narrative prose into an ordered sequence of structured intents.
   *
   * Responsibilities (from docs/intents.md):
   * - Split prose into multiple intents when applicable.
   * - Classify each intent as "dialogue", "action", or "monologue".
   * - Parse narrative text into structured JSON with minimal information loss.
   * - Contextually resolve receiving parties (targets).
   */
  async decode(
    worldState: WorldState,
    actorId: string,
    narrativeProse: string,
  ): Promise<IntentSequence> {
    const entityIds = Array.from(worldState.entities.keys());
    const actor = worldState.getEntity(actorId);

    const aliasEntries = actor ? Array.from(actor.aliases.entries()) : [];
    const aliasContext =
      aliasEntries.length > 0
        ? aliasEntries
            .map(
              ([targetId, alias]) =>
                `- "${alias}" refers to entity ID: "${targetId}"`,
            )
            .join("\n")
        : "(No known aliases)";

    const systemPrompt = `
You are the Intent Decoder for a narrative simulation engine.
Your job is to take a block of narrative prose written by an actor agent and decompose it into an ordered sequence of discrete intents.

For each intent you must:
1. Classify its type:
   - "dialogue": if actor speaking, talking, whispering, murmuring, etc
   - "action": Any physical or logical action performed in the world (e.g., moving, opening, looking).
   - "monologue": An inner thought, reflection, or internal monologue/self narration.
2. Extract the original text fragment from the prose that corresponds to this intent.
3. Populate "description" and "selfDescription":
   - "description": No subject or name — a bare third-person verb phrase only (e.g. "clears their throat", "shakes their head slowly")
   - "selfDescription": The same event from the actor's own perspective, second person, complete sentence starting with "You" (e.g. "You clear your throat.", "You shake your head slowly."). This is shown directly in the actor's own memory — it must never say "the actor" or refer to them in the third person.
   - In case of a dialogue, the description and self Description only stores the exact words said by the entity. (e.g. "I will do that later", "Are you serious right now?")
4. Identify targetIds — the entity IDs of the receiving parties. Use the "KNOWN ENTITY IDS" mapping to resolve any subjective names,or aliases used in the prose to their correct system entity IDs. If no specific target, use an empty array.
5. Identify modifiers — a list of strings representing additional qualities or modifiers extracted from the narrative prose. This includes emotions, tone of voice, speed, manner of action, or statement type (e.g., "question", "anxious", "whispering", "slowly", "quietly", "forcefully"). If no modifiers are present, use an empty array.
`.trim();

    const userContext = `
=== KNOWN ENTITY IDS ===
${entityIds.length > 0 ? entityIds.join(", ") : "(No entities)"}

=== ACTOR ALIASES ===
The actor refers to other entities using these subjective names/aliases:
${aliasContext}

=== WORLD STATE ===
${serializeSimplifiedWorldState(worldState)}

=== ACTOR ===
Actor ID: ${actorId}

=== NARRATIVE PROSE ===
${narrativeProse}
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: LLMIntentSequenceSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `Intent decoding failed: ${response.error || "Unknown LLM error"}`,
      );
    }

    const fullIntents = response.data.intents.map((intent) => ({
      ...intent,
      actorId,
    }));

    return {
      intents: fullIntents,
    };
  }
}

function serializeSimplifiedWorldState(worldState: WorldState): string {
  const lines: string[] = [];

  lines.push("Locations:");
  if (worldState.locations.size > 0) {
    for (const loc of worldState.locations.values()) {
      const parentId = (loc as { parentId?: string | null }).parentId;
      const parentStr = parentId ? ` (Parent: ${parentId})` : "";
      lines.push(`  - Location [ID: ${loc.id}]${parentStr}`);
    }
  } else {
    lines.push("  (No locations)");
  }

  lines.push("Entities:");
  if (worldState.entities.size > 0) {
    for (const entity of worldState.entities.values()) {
      const locStr = entity.locationId
        ? ` (Location: ${entity.locationId})`
        : "";
      lines.push(`  - Entity [ID: ${entity.id}]${locStr}`);
    }
  } else {
    lines.push("  (No entities)");
  }

  return lines.join("\n");
}
