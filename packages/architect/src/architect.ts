import { WorldState } from "@omnia/core";
import { LLMValidator, ValidationResult } from "./llmValidator.js";
import { ILLMProvider } from "@omnia/llm";

export class Architect {
  private validator: LLMValidator;

  constructor(llmProvider: ILLMProvider) {
    this.validator = new LLMValidator(llmProvider);
  }

  /**
   * Processes and validates a proposed intent action in the world.
   * If valid, return success. If invalid, returns denial with reasons.
   */
  async validateIntent(
    worldState: WorldState,
    actorId: string,
    actionIntent: string,
  ): Promise<ValidationResult> {
    return this.validator.validate(worldState, actorId, actionIntent);
  }
}
