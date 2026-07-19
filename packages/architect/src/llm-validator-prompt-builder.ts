import { WorldState, serializeObjectiveWorldState } from "@omnia/core";
import { Intent } from "@omnia/intent";
import { hydrateObjective } from "@omnia/voice";
import { PromptBreakdown, PromptComponent, IPromptBuilder } from "@omnia/llm";

/**
 * Prompt builder for the LLM Validator (World Architect).
 * Separates prompt generation, structure, and component breakdowns.
 */
export class LLMValidatorPromptBuilder implements IPromptBuilder<
  [WorldState, Intent]
> {
  build(worldState: WorldState, intent: Intent): PromptBreakdown {
    const serializedWorld = serializeObjectiveWorldState(worldState);

    const systemPrompt = `
You are the World Architect, a deterministic and objective judge of reality, physics, and narration for a simulation game.
Your task is to judge whether a proposed action (Intent) by an actor is physically and logically possible given the current objective state of the world.
Exempt dialogue or speech actions from validation (consider them always valid).
Enforce logical boundaries such as:
- Spatial boundaries (an actor cannot grab an object in another location unless they are there).
- Physical boundaries (an actor cannot open a locked drawer without a key or breaking it).
- State Boundaries (an actor cannot perform a task if their state doesn't allow them to do so).
- State/Attribute constraints.
- An actor can perform actions on themselves as long as it follows the boundaries stated above.

You must respond with a JSON object containing:
- "isValid": boolean indicating if the action is possible/allowed.
- "reason": a very short explanation of why the action is allowed or denied.
`.trim();

    const objectiveContent = hydrateObjective(intent.content, worldState);

    const worldStateSection = `=== CURRENT WORLD STATE ===\nCurrent Time: ${worldState.clock.get().toISOString()}\nEntities & Attributes:\n${serializedWorld}`;
    const proposedActionSection = `=== PROPOSED ACTION ===\nActor ID: ${intent.actorId}\nType: ${intent.type}\nContent: "${objectiveContent}"\nTarget IDs: ${intent.targetIds.join(", ") || "(None)"}`;

    const userContext = `${worldStateSection}\n\n${proposedActionSection}\n\nDecide if the proposed action is logically valid and physically possible.`;

    const components: PromptComponent[] = [
      { label: "System Prompt", type: "system", content: systemPrompt },
      {
        label: "Current World State",
        type: "world",
        content: worldStateSection,
      },
      {
        label: "Proposed Action",
        type: "input",
        content: proposedActionSection,
      },
    ];

    return {
      systemPrompt,
      userContext,
      components,
    };
  }
}
