import { z } from "zod";

/**
 * Intent types as classified by the Intent Decoder.
 * - "dialogue": Speech or conversation directed at another entity.
 * - "action": A physical or logical action performed in the world.
 * - "monologue": An inner thought or internal monologue. Not perceivable by
 *   any other entity. Bypasses the Architect/validators entirely and is
 *   written directly to the actor's Cognitive Buffer with no outcome.
 * - "thought": Equivalent/alias to "monologue".
 */
export const IntentTypeSchema = z.enum([
  "dialogue",
  "action",
  "monologue",
  "thought",
]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

/**
 * A single decoded intent extracted from narrative prose.
 */
export const LLMIntentSchema = z.object({
  /** The type of intent. */
  type: IntentTypeSchema,

  /** The dehydrated canonical content of the intent. */
  content: z.string(),

  /**
   * Entity IDs of the receiving parties (e.g., who is being spoken to,
   * what object is being interacted with). Always an empty array for
   * "monologue" and "thought" intents, since they are not perceivable by anyone.
   */
  targetIds: z.array(z.string()),

  /**
   * Additional qualities or modifiers extracted from the prose (e.g., emotions,
   * questions, speed, manner of action like 'quietly', 'whispering', 'anxiously').
   */
  modifiers: z.array(z.string()),
});

export const IntentSchema = LLMIntentSchema.extend({
  /** The entity ID of the actor performing the intent. */
  actorId: z.string(),
});

export type Intent = z.infer<typeof IntentSchema>;

export const LLMIntentSequenceSchema = z.object({
  intents: z.array(LLMIntentSchema),
});

/**
 * The full output of the Intent Decoder: an ordered sequence of intents
 * extracted from a single narrative prose block.
 */
export const IntentSequenceSchema = z.object({
  intents: z.array(IntentSchema),
});

export type IntentSequence = z.infer<typeof IntentSequenceSchema>;
