import { WorldState } from "@omnia/core";
import { ILLMProvider } from "@omnia/llm";
import { dehydrate, expandContractions } from "@omnia/voice";
import { Intent, IntentSequence, LLMIntentSequenceSchema } from "./intent.js";
import { IntentDecoderPromptBuilder } from "./intent-prompt-builder.js";

export class IntentDecoder {
  private promptBuilder: IntentDecoderPromptBuilder;

  constructor(private llmProvider: ILLMProvider) {
    this.promptBuilder = new IntentDecoderPromptBuilder();
  }

  /**
   * Decodes narrative prose into an ordered sequence of structured intents.
   */
  async decode(
    worldState: WorldState,
    actorId: string,
    narrativeProse: string,
    recentIntents: Intent[] = [],
  ): Promise<IntentSequence> {
    const processedProse = expandContractions(narrativeProse);
    const actor = worldState.getEntity(actorId);

    const { systemPrompt, userContext, components } = this.promptBuilder.build(
      worldState,
      actorId,
      processedProse,
      recentIntents,
    );

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
      systemPrompt,
      userContext,
      promptComponents: components,
    };
  }
}
