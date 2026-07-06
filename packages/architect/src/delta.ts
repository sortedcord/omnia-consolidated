import { z } from "zod";
import { WorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";

export const TimeDeltaSchema = z.object({
  minutesToAdvance: z.number().int().nonnegative(),
  explanation: z.string(),
});

export type TimeDelta = z.infer<typeof TimeDeltaSchema>;

export interface IDeltaGenerator<T> {
  generate(
    worldState: WorldState,
    actorId: string,
    actionIntent: string,
  ): Promise<T>;
}

export class TimeDeltaGenerator implements IDeltaGenerator<TimeDelta> {
  constructor(private llmProvider: ILLMProvider) {}

  async generate(
    worldState: WorldState,
    actorId: string,
    actionIntent: string,
  ): Promise<TimeDelta> {
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
${worldState.serialize()}

=== ACTION ===
Actor ID: ${actorId}
Action: "${actionIntent}"
`.trim();

    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: TimeDeltaSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(`Failed to generate time delta: ${response.error || "Unknown LLM error"}`);
    }

    return response.data;
  }
}
