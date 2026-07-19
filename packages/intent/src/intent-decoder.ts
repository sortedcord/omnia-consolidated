import { WorldState, resolveAlias } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { Intent, IntentSequence, LLMIntentSequenceSchema } from "./intent.js";

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
    recentIntents: Intent[] = [],
  ): Promise<IntentSequence> {
    const actor = worldState.getEntity(actorId);

    // 1. Get other entities co-located in the same context
    const otherEntitiesLines: string[] = [];
    for (const otherEntity of worldState.entities.values()) {
      if (
        otherEntity.id !== actorId &&
        otherEntity.locationId === actor?.locationId
      ) {
        const alias = actor
          ? resolveAlias(actor, otherEntity.id)
          : otherEntity.id;
        otherEntitiesLines.push(`    - Alias="${alias}" ID=${otherEntity.id}`);
      }
    }
    const otherEntitiesContext =
      otherEntitiesLines.length > 0
        ? otherEntitiesLines.join("\n")
        : "    (No other entities in context)";

    // 2. Format historical context (2-3 recent intents received by the actor)
    const historicalLines: string[] = [];
    for (const prior of recentIntents) {
      const targetIds =
        prior.actorId !== actorId ? [prior.actorId] : prior.targetIds;
      const targetsStr = targetIds
        .map((tid) => {
          const alias = actor ? resolveAlias(actor, tid) : tid;
          return `(Alias="${alias}", ID="${tid}")`;
        })
        .join(", ");
      historicalLines.push(
        `    - Content: "${prior.originalText}", Type: ${prior.type}, Target Entities: ${targetsStr || "None"}`,
      );
    }
    const historicalContext =
      historicalLines.length > 0
        ? historicalLines.join("\n")
        : "    (No prior intents in context)";

    const systemPrompt = `
You are the Intent Decoder for a narrative simulation engine.
Your job is to take a block of narrative prose written by an actor agent and decompose it into an ordered sequence of discrete intents.

For each intent you must:
1. Classify its type:
   - "dialogue": if actor speaking, talking, whispering, murmuring, etc
   - "action": Any physical or logical action performed in the world (e.g., moving, opening, looking).
   - "monologue" (or "thought"): An inner thought, reflection, or internal monologue/self narration.
2. Extract the original text fragment from the prose that corresponds to this intent.
3. Populate "description" and "selfDescription":
   - "description": No subject or name — a bare third-person verb phrase only (e.g. "clears their throat", "shakes their head slowly")
   - "selfDescription": The same event from the actor's own perspective, second person, complete sentence starting with "You" (e.g. "You clear your throat.", "You shake your head slowly."). This is shown directly in the actor's own memory — it must never say "the actor" or refer to them in the third person.
   - In case of a dialogue, the description and self Description only stores the exact words said by the entity. (e.g. "I will do that later", "Are you serious right now?")
4. Identify targetIds — the entity IDs of the receiving parties. Use the "Other entities in context" list to resolve any subjective names, aliases, or descriptions used in the prose to their correct entity IDs. If no specific target, use an empty array.
5. Identify modifiers — a list of strings representing additional qualities or modifiers extracted from the narrative prose. This includes emotions, tone of voice, speed, manner of action, or statement type (e.g., "question", "anxious", "whispering", "slowly", "quietly", "forcefully"). If no modifiers are present, use an empty array.
`.trim();

    const userContext = `
Intent Source: ${actorId}
Other entities in context:
${otherEntitiesContext}
Historical Context:
${historicalContext}

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
