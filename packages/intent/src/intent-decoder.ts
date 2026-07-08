import { WorldState, serializeObjectiveWorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { IntentSequence, IntentSequenceSchema } from "./intent.js";

export class IntentDecoder {
  constructor(private llmProvider: ILLMProvider) {}

  /**
   * Decodes narrative prose into an ordered sequence of structured intents.
   *
   * Responsibilities (from docs/intents.md):
   * - Split prose into multiple intents when applicable.
   * - Classify each intent as "dialogue" or "action".
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
    const aliasContext = aliasEntries.length > 0
      ? aliasEntries.map(([targetId, alias]) => `- "${alias}" refers to entity ID: "${targetId}"`).join("\n")
      : "(No known aliases)";

    const systemPrompt = `
You are the Intent Decoder for a narrative simulation engine.
Your job is to take a block of narrative prose written by an actor agent and decompose it into an ordered sequence of discrete intents.

For each intent you must:
1. Classify its type:
   - "dialogue": Any speech, conversation, or verbal communication directed at another entity.
   - "action": Any physical or logical action performed in the world (e.g., moving, picking up, opening, looking).
2. Extract the original text fragment from the prose that corresponds to this intent.
3. Write a concise, structured description of the intent (what is being done or said). Include as much detail about the action as possible that was extracted from the narrative prose. Do not make up qualities.
4. Identify the actorId (the entity performing the intent — this will always be "${actorId}").
5. Identify targetIds — the entity IDs of the receiving parties. Use the "KNOWN ENTITY IDS" and "ACTOR ALIASES" mapping to resolve any subjective names, descriptions, or nicknames used in the prose to their correct system entity IDs. If no specific target, use an empty array.

Rules:
- Preserve the chronological order of intents as they appear in the prose.
- Do NOT merge unrelated actions into a single intent.
- Dialogue and actions should be separate intents even if they happen in the same sentence.
- If the prose contains only dialogue, return a single dialogue intent.
- If the prose contains only a single action, return a single action intent.
`.trim();

    const userContext = `
=== KNOWN ENTITY IDS ===
${entityIds.length > 0 ? entityIds.join(", ") : "(No entities)"}

=== ACTOR ALIASES ===
The actor refers to other entities using these subjective names/aliases:
${aliasContext}

=== WORLD STATE ===
${serializeObjectiveWorldState(worldState)}

=== ACTOR ===
Actor ID: ${actorId}

=== NARRATIVE PROSE ===
${narrativeProse}
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: IntentSequenceSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `Intent decoding failed: ${response.error || "Unknown LLM error"}`,
      );
    }

    return response.data;
  }
}
