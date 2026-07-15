import { WorldState, SQLiteRepository } from "@omnia/core";
import { LLMValidator, ValidationResult } from "./llm-validator.js";
import { TimeDeltaGenerator, TimeDelta } from "./delta.js";
import { ILLMProvider } from "@omnia/llm";
import { Intent } from "@omnia/intent";

export interface ProcessResult extends ValidationResult {
  timeDelta?: TimeDelta;
}

export class Architect {
  private validator: LLMValidator;
  private timeDeltaGenerator: TimeDeltaGenerator;

  constructor(
    llmProvider:
      ILLMProvider | { validator: ILLMProvider; timedelta: ILLMProvider },
    private repo?: SQLiteRepository,
  ) {
    let valProv: ILLMProvider;
    let timeProv: ILLMProvider;

    if ("validator" in llmProvider && "timedelta" in llmProvider) {
      valProv = llmProvider.validator;
      timeProv = llmProvider.timedelta;
    } else {
      valProv = llmProvider;
      timeProv = llmProvider;
    }

    this.validator = new LLMValidator(valProv);
    this.timeDeltaGenerator = new TimeDeltaGenerator(timeProv);
  }

  /**
   * Processes and validates a proposed intent action in the world.
   * If valid, return success. If invalid, returns denial with reasons.
   */
  async validateIntent(
    worldState: WorldState,
    intent: Intent,
  ): Promise<ValidationResult> {
    return this.validator.validate(worldState, intent);
  }

  /**
   * Processes, validates, generates deltas, applies them to the world state,
   * and persists the changes to the database.
   *
   * "monologue" intents are internal thoughts — they bypass validation and
   * time-delta generation entirely: the clock does not advance, the world
   * state is not mutated or persisted. The caller is responsible for writing
   * the monologue to the actor's memory buffer.
   */
  async processIntent(
    worldState: WorldState,
    intent: Intent,
  ): Promise<ProcessResult> {
    // 0. Monologue intents are purely internal — short-circuit before any
    // validation or world mutation.
    if (intent.type === "monologue") {
      return {
        isValid: true,
        reason:
          "Monologue intent bypasses validation (internal thought, not perceivable).",
        timeDelta: {
          minutesToAdvance: 0,
          explanation: "Internal thought — no time elapsed.",
        },
      };
    }

    // 1. Validate the intent action
    const validation = await this.validateIntent(worldState, intent);
    if (!validation.isValid) {
      return validation;
    }

    // 2. Generate time delta for the valid action
    const timeDelta = await this.timeDeltaGenerator.generate(
      worldState,
      intent,
    );

    // 3. Apply the time delta to the world state clock
    worldState.clock.advance(timeDelta.minutesToAdvance);

    // 4. Save and persist the updated world state
    if (this.repo) {
      this.repo.saveWorldState(worldState);
    }

    return {
      isValid: true,
      reason: validation.reason,
      timeDelta,
    };
  }
}
