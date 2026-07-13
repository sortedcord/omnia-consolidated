import { z } from "zod";
import { WorldState, serializeObjectiveWorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { Intent } from "@omnia/intent";

export const TimeDeltaSchema = z.object({
  minutesToAdvance: z.number().int().nonnegative(),
  explanation: z.string(),
});

export type TimeDelta = z.infer<typeof TimeDeltaSchema>;

export interface IDeltaGenerator<T> {
  generate(worldState: WorldState, intent: Intent): Promise<T>;
}

export class TimeDeltaGenerator implements IDeltaGenerator<TimeDelta> {
  constructor(private llmProvider: ILLMProvider) {}

  async generate(worldState: WorldState, intent: Intent): Promise<TimeDelta> {
    // We can do this right now because we haven't yet started the implementation of the Event Scheduler or a Tick Engine
    // Once we do, please review this code.
    if (intent.type === "dialogue") {
      return {
        minutesToAdvance: 1,
        explanation: "Dialogue action; 1 minute granted for quick exchange.",
      };
    }
    if (intent.type === "monologue") {
      return {
        minutesToAdvance: 0,
        explanation: "Monologue action; no time advanced for internal thought.",
      };
    }

    const systemPrompt = `
You are the Time Delta Generator for the World Architect.
Your task is to judge how much time (in minutes) a proposed action would logically take to execute in the physical world.
Enforce realistic physical constraints:
- Simple actions (e.g. picking up an unlocked key, looking around) take 1-2 minutes.
- Walking between rooms takes 2-5 minutes.
- Complex tasks (e.g. searching a room thoroughly, reading a book chapter, picking a lock) take 15-60 minutes.
Return a structured JSON object containing:
- "minutesToAdvance": integer (0 or more) representing the time elapsed.
- "explanation": a brief explanation of why this amount of time is appropriate.
`.trim();

    const userContext = `
=== CURRENT WORLD STATE ===
Current Time: ${worldState.clock.get().toISOString()}
World Details:
${serializeObjectiveWorldState(worldState)}

=== ACTION ===
Actor ID: ${intent.actorId}
Type: ${intent.type}
Description: "${intent.description}"
Original Text: "${intent.originalText}"
Target IDs: ${intent.targetIds.join(", ") || "(None)"}
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: TimeDeltaSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `Failed to generate time delta: ${response.error || "Unknown LLM error"}`,
      );
    }

    return response.data;
  }
}

export const AliasDeltaSchema = z.object({
  alias: z.string(),
});

export type AliasDelta = z.infer<typeof AliasDeltaSchema>;

export class AliasDeltaGenerator {
  constructor(private llmProvider: ILLMProvider) {}

  /**
   * Generates a natural, subjective descriptive alias for a target entity
   * based on its visible attributes from the perspective of a viewer entity.
   */
  async generate(
    viewer: import("@omnia/core").Entity,
    target: import("@omnia/core").Entity,
  ): Promise<string> {
    const visibleAttrs = target.getVisibleAttributesFor(viewer.id);
    const attrsStr = visibleAttrs
      .map((a) => `* ${a.name}: ${a.getValue()}`)
      .join("\n");

    const systemPrompt = `
You are the Alias Delta Generator for the World Architect.
Your task is to generate a natural, subjective, descriptive alias (noun phrase) that a viewer entity would use to refer to a target entity they are seeing for the first time, based ONLY on the target entity's visible public attributes.

Rules:
1. The alias must be a simple, natural, subjective noun phrase.
2. Base the description strictly on the target's visible attributes. Do not invent details not present in the attributes.
3. Never use raw system IDs or UUIDs in the alias description.
4. Do not use the target's private name attribute unless they have explicit access to it (which is already filtered in the attributes list).
5. Keep the phrase very short. Not more than 5 words. These aliases can also be internal nicknames for those entities.
6. Return a structured JSON object containing:
   - "alias": string representing the descriptive alias.
`.trim();

    const userContext = `
Viewer Entity ID: ${viewer.id}
Target Entity ID: ${target.id}

Target's Visible Attributes:
${attrsStr || "(No visible attributes)"}
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: AliasDeltaSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `Failed to generate alias delta: ${response.error || "Unknown LLM error"}`,
      );
    }

    return response.data.alias;
  }
}
