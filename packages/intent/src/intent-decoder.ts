import { WorldState, resolveAlias } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { dehydrate } from "@omnia/voice";
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
      // In the historical context, prior.content is already dehydrated, so we hydrate it for the actor's view
      // Wait, we can keep it simple or just use the content. We'll show the content.
      historicalLines.push(
        `    - Content: "${prior.content}", Type: ${prior.type}, Target Entities: ${targetsStr || "None"}`,
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
   - "action": Any physical action performed in the world (e.g., moving, opening, looking). DO NOT CLASSIFY SPEAKING MODIFIERS AS ACTIONS
   - "monologue" (or "thought"): An inner thought, reflection, or monologue/self narration.
2. Extract the original narrative text fragment from the prose that corresponds to this intent and populate it as "content". Do not paraphrase, do not convert to third person, and do not convert to second person. Keep the original text fragment exactly as written in the prose (first-person voice).
3. Identify targetIds — the entity IDs of the receiving parties. Use the "Other entities in context" list to resolve any subjective names, aliases, or descriptions used in the prose to their correct entity IDs. If no specific target, use an empty array.
4. Identify modifiers — a list of strings representing additional qualities or modifiers extracted from the narrative prose. This includes emotions, tone of voice, speed, manner of action, or statement type (e.g., "question", "anxious", "whispering", "slowly", "quietly", "forcefully"). If no modifiers are present, use an empty array.
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

    const aliasMap: Record<string, string> = {};
    if (actor) {
      for (const [targetId, alias] of actor.aliases.entries()) {
        aliasMap[alias] = targetId;
      }
    }

    const fullIntents = response.data.intents.map((intent) => {
      const dehydrated = dehydrate(
        intent.content,
        actorId,
        intent.targetIds,
        aliasMap,
      );
      return {
        ...intent,
        content: dehydrated,
        actorId,
      };
    });

    return {
      intents: fullIntents,
    };
  }
}
