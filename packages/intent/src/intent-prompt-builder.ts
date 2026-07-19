import { WorldState, resolveAlias } from "@omnia/core";
import { PromptBreakdown, PromptComponent } from "@omnia/llm";
import { Intent } from "./intent.js";

// TODO: Builder a generic interface for prompt builders in @omnia/llm: IPromptBuilder or something

/**
 * Prompt builder for the Intent Decoder.
 * Separates prompt generation, structure, and component breakdowns.
 */
export class IntentDecoderPromptBuilder {
  build(
    worldState: WorldState,
    actorId: string,
    processedProse: string,
    recentIntents: Intent[],
  ): PromptBreakdown {
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
5. For dialogue intents always use the following format for content field:
    I say "<dialogue>" (optionally: to him/her/alias).
`.trim();

    const decoderContext = `
Intent Source: ${actorId}
Other entities in context:
${otherEntitiesContext}
Historical Context:
${historicalContext}
`.trim();

    const narrativeProseSection = `=== NARRATIVE PROSE ===\n${processedProse}`;

    const userContext = `${decoderContext}\n\n${narrativeProseSection}`;

    const components: PromptComponent[] = [
      { label: "System Prompt", type: "system", content: systemPrompt },
      { label: "Decoder Context", type: "world", content: decoderContext },
      {
        label: "Narrative Prose",
        type: "input",
        content: narrativeProseSection,
      },
    ];

    return {
      systemPrompt,
      userContext,
      components,
    };
  }
}
