import { z } from "zod";
import { WorldState } from "@omnia/core";
import { ILLMProvider, PromptBreakdown } from "@omnia/llm";
import { Intent } from "@omnia/intent";
import { LLMValidatorPromptBuilder } from "./llm-validator-prompt-builder.js";

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  reason: z.string(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export class LLMValidator {
  public lastResult: PromptBreakdown | null = null;
  private promptBuilder: LLMValidatorPromptBuilder;

  constructor(private llmProvider: ILLMProvider) {
    this.promptBuilder = new LLMValidatorPromptBuilder();
  }

  /**
   * Validates an action intent against the objective world state.
   *
   * "monologue" and "thought" intents must never reach this validator — they are internal
   * thoughts that bypass validation entirely (see Architect.processIntent).
   * This guard exists as a defensive safeguard.
   */
  async validate(
    worldState: WorldState,
    intent: Intent,
  ): Promise<ValidationResult> {
    this.lastResult = null;

    // Defensive guard: monologue and thought intents bypass validation.
    if (intent.type === "monologue" || intent.type === "thought") {
      return {
        isValid: true,
        reason:
          "Monologue/thought intents are internal thoughts and bypass validation.",
      };
    }

    const actor = worldState.getEntity(intent.actorId);
    if (!actor) {
      return {
        isValid: false,
        reason: `Actor entity with ID "${intent.actorId}" does not exist in the world state.`,
      };
    }

    const { systemPrompt, userContext, components } = this.promptBuilder.build(
      worldState,
      intent,
    );

    this.lastResult = {
      systemPrompt,
      userContext,
      components,
    };

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
}
