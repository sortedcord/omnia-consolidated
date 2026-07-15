import { Entity, WorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { BufferEntry, BufferRepository, LedgerRepository } from "@omnia/memory";
import { Intent, IntentDecoder, IntentSequence } from "@omnia/intent";
import {
  ActorPromptBuilder,
  ActorResponseSchema,
} from "./actor-prompt-builder.js";

/**
 * Interface to generate narrative prose for an actor.
 * Allows switching between LLM generators and human CLI inputs.
 */
export interface IActorProseGenerator {
  generate(
    entityId: string,
    systemPrompt: string,
    userContext: string,
  ): Promise<string>;
}

/**
 * Default implementation of IActorProseGenerator using an LLM.
 */
export class LLMActorProseGenerator implements IActorProseGenerator {
  constructor(private llmProvider: ILLMProvider) {}

  async generate(
    entityId: string,
    systemPrompt: string,
    userContext: string,
  ): Promise<string> {
    const response = await this.llmProvider.generateStructuredResponse({
      systemPrompt,
      userContext,
      schema: ActorResponseSchema,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `Actor generation failed for entity "${entityId}": ${response.error || "Unknown LLM error"}`,
      );
    }

    return response.data.narrativeProse;
  }
}

/**
 * Result of a single actor turn.
 */
export interface ActorTurnResult {
  /** The raw narrative prose the actor produced. */
  narrativeProse: string;
  /** The decoded intent sequence (split/classified from the prose). */
  intents: IntentSequence;
}

/**
 * The Actor Agent: embodies a single entity and generates its next beat of
 * behavior as narrative prose, then decodes that prose into a structured
 * intent sequence via the IntentDecoder.
 *
 * The actor itself does NOT mutate world state or write memory — that is
 * the responsibility of the caller (who routes intents through the
 * Architect and writes buffer entries). The actor only produces the
 * proposal. This keeps the actor's role cleanly separated from
 * validation and persistence.
 */
export class ActorAgent {
  private promptBuilder: ActorPromptBuilder;
  private decoder: IntentDecoder;
  private generator: IActorProseGenerator;

  private llmProvider: ILLMProvider;

  constructor(
    llmProvider: ILLMProvider | { actor: ILLMProvider; decoder: ILLMProvider },
    bufferRepo?: BufferRepository,
    ledgerRepo?: LedgerRepository,
    memoryLimit?: number,
    generator?: IActorProseGenerator,
  ) {
    let actorProv: ILLMProvider;
    let decoderProv: ILLMProvider;

    if ("actor" in llmProvider && "decoder" in llmProvider) {
      actorProv = llmProvider.actor;
      decoderProv = llmProvider.decoder;
    } else {
      actorProv = llmProvider;
      decoderProv = llmProvider;
    }

    this.promptBuilder = new ActorPromptBuilder(
      bufferRepo,
      ledgerRepo,
      memoryLimit,
    );
    this.decoder = new IntentDecoder(decoderProv);
    this.generator = generator ?? new LLMActorProseGenerator(actorProv);
    this.llmProvider = actorProv;
  }

  /**
   * Has the entity produce its next beat of behavior.
   *
   * 1. Builds an epistemically-bounded prompt for the entity.
   * 2. Asks the generator (LLM or human) for narrative prose.
   * 3. Decodes the prose into a structured IntentSequence.
   */
  async act(worldState: WorldState, entity: Entity): Promise<ActorTurnResult> {
    if (!entity.isAgent) {
      throw new Error(
        `Entity "${entity.id}" is not an agent and cannot use the actor interface.`,
      );
    }

    const { systemPrompt, userContext } = this.promptBuilder.build(
      worldState,
      entity,
    );

    const narrativeProse = await this.generator.generate(
      entity.id,
      systemPrompt,
      userContext,
    );

    const intents = await this.decoder.decode(
      worldState,
      entity.id,
      narrativeProse,
    );

    return {
      narrativeProse,
      intents,
    };
  }
}

/**
 * Helper: builds a BufferEntry for an intent produced on behalf of an
 * entity. For "action" intents the caller should attach an `outcome`
 * after the Architect has processed it; for "dialogue" and "monologue"
 * intents no outcome is needed (dialogue is always valid; monologue
 * bypasses validation entirely).
 */
export function buildBufferEntryForIntent(
  intent: Intent,
  timestamp: string,
  locationId: string | null,
): BufferEntry {
  return {
    id: crypto.randomUUID(),
    ownerId: intent.actorId,
    timestamp,
    locationId,
    intent,
  };
}
