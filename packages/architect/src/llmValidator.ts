import { z } from "zod";
import { WorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  reason: z.string(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export class LLMValidator {
  constructor(private llmProvider: ILLMProvider) {}

  /**
   * Validates an action intent against the objective world state.
   */
  async validate(
    worldState: WorldState,
    actorId: string,
    actionIntent: string,
  ): Promise<ValidationResult> {
    const actor = worldState.getEntity(actorId);
    if (!actor) {
      return {
        isValid: false,
        reason: `Actor entity with ID "${actorId}" does not exist in the world state.`,
      };
    }

    // 1. Serialize the objective world state for the LLM
    const serializedWorld = this.serializeWorldState(worldState);

    // 2. Build the prompts
    const systemPrompt = `
You are the World Architect, a deterministic and objective judge of reality, physics, and narration for a simulation game.
Your task is to judge whether a proposed action (Intent) by an actor is physically and logically possible given the current objective state of the world.
Exempt dialogue or speech actions from validation (consider them always valid).
Enforce logical boundaries such as:
- Spatial boundaries (an actor cannot grab an object in another location unless they are there).
- Physical boundaries (an actor cannot open a locked drawer without a key or breaking it).
- State/Attribute constraints.

You must respond with a JSON object containing:
- "isValid": boolean indicating if the action is possible/allowed.
- "reason": a concise explanation of why the action is allowed or denied.
`.trim();

    const userContext = `
=== CURRENT WORLD STATE ===
Current Time: ${worldState.clock.get().toISOString()}
Entities & Attributes:
${serializedWorld}

=== PROPOSED ACTION ===
Actor ID: ${actorId}
Proposed Action: "${actionIntent}"

Decide if the proposed action is logically valid and physically possible.
`.trim();

    // structured call via the LLM provider
    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: ValidationResultSchema,
    });

    if (!response.success || !response.data) {
      return {
        isValid: false,
        reason: `LLM validation failed: ${response.error || "Unknown LLM error"}`,
      };
    }

    return response.data;
  }

  private serializeWorldState(worldState: WorldState): string {
    const lines: string[] = [];

    // Serialize world attributes
    if (worldState.attributes.size > 0) {
      lines.push("World Attributes:");
      for (const [name, attr] of worldState.attributes.entries()) {
        lines.push(
          `  - ${name}: ${attr.getValue()} (Visibility: ${attr.getVisibility()})`,
        );
      }
    }

    // Serialize entities and their attributes
    lines.push("Entities:");
    for (const entity of worldState.entities.values()) {
      lines.push(`  - Entity [ID: ${entity.id}]:`);
      if (entity.attributes.size > 0) {
        for (const [name, attr] of entity.attributes.entries()) {
          const aclList = Array.from(attr.getAllowedEntities());
          const aclStr =
            aclList.length > 0 ? ` (Visible to: ${aclList.join(", ")})` : "";
          lines.push(
            `      * ${name}: ${attr.getValue()} (Visibility: ${attr.getVisibility()})${aclStr}`,
          );
        }
      } else {
        lines.push("      * (No attributes)");
      }
    }

    return lines.join("\n");
  }
}
