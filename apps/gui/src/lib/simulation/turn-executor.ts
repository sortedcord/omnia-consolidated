import {
  ActorAgent,
  ActorPromptBuilder,
  buildBufferEntryForIntent,
} from "@omnia/actor";
import type { IActorProseGenerator } from "@omnia/actor";
import type { SimSession } from "./types";
import type {
  EntityInfo,
  IntentInfo,
  LogEntry,
  WaitingContext,
} from "../simulation-types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Prose generator that returns a fixed player-supplied string verbatim. */
class FixedProseGenerator implements IActorProseGenerator {
  constructor(private prose: string) {}

  async generate(
    entityId: string,
    systemPrompt: string,
    userContext: string,
  ): Promise<string> {
    void entityId;
    void systemPrompt;
    void userContext;
    return this.prose;
  }
}

/**
 * Processes every intent produced by an actor turn:
 * - Validates via Architect
 * - Appends to actor's own buffer
 * - Fan-outs to co-located observers for dialogue/action intents
 *
 * Extracted to eliminate verbatim duplication between NPC and player paths.
 */
async function processIntents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intents: any[],
  actorEntityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entity: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worldState: any,
  session: SimSession,
): Promise<{ intentInfos: IntentInfo[]; validatorCalls: ValidatorCall[] }> {
  const intentInfos: IntentInfo[] = [];
  const validatorCalls: ValidatorCall[] = [];

  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    const outcome = await session.architect.processIntent(worldState, intent);
    const ts = worldState.clock.get().toISOString();

    intentInfos.push({
      type: intent.type,
      content: intent.content,
      modifiers: intent.modifiers || [],
      targetIds: intent.targetIds,
      isValid: outcome.isValid,
      reason: outcome.reason,
      minutesToAdvance: outcome.timeDelta?.minutesToAdvance,
    });

    if (
      intent.type === "action" &&
      (session.architect.validator as any).lastResult
    ) {
      const lastResult = (session.architect.validator as any).lastResult;
      let usage = undefined;
      if (
        session.validatorProvider.lastCalls &&
        session.validatorProvider.lastCalls.length > 0
      ) {
        const valCall =
          session.validatorProvider.lastCalls[
            session.validatorProvider.lastCalls.length - 1
          ];
        usage = valCall.usage;
      }

      validatorCalls.push({
        intentIndex: i,
        intentContent: intent.content,
        prompt: {
          systemPrompt: lastResult.systemPrompt || "",
          userContext: lastResult.userContext || "",
          components: lastResult.promptComponents,
        },
        response: {
          isValid: outcome.isValid,
          reason: outcome.reason,
        },
        usage,
      });
    } else {
      const reason =
        intent.type === "dialogue"
          ? "Dialogue intents represent verbal/communication actions and are automatically valid."
          : "Monologue/thought intents represent internal reflections and bypass validation.";

      validatorCalls.push({
        intentIndex: i,
        intentContent: intent.content,
        response: {
          isValid: true,
          reason: outcome.reason || reason,
        },
      });
    }

    const actorEntry = buildBufferEntryForIntent(intent, ts, entity.locationId);
    if (intent.type === "action") {
      actorEntry.outcome = { isValid: outcome.isValid, reason: outcome.reason };
    }
    session.bufferRepo.save(actorEntry);

    // Fan-out observable events to co-located entities
    if (
      entity.locationId &&
      (intent.type === "dialogue" || intent.type === "action")
    ) {
      for (const [, other] of worldState.entities) {
        if (
          other.id !== actorEntityId &&
          other.locationId === entity.locationId
        ) {
          const observerEntry = buildBufferEntryForIntent(
            intent,
            ts,
            entity.locationId,
          );
          if (intent.type === "action") {
            observerEntry.outcome = {
              isValid: outcome.isValid,
              reason: outcome.reason,
            };
          }
          session.bufferRepo.save({ ...observerEntry, ownerId: other.id });
        }
      }
    }
  }

  return { intentInfos, validatorCalls };
}

// ---------------------------------------------------------------------------
// Exported turn functions
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for the player entity and sets the session to
 * `waiting_player` so the next client call can supply the prose.
 */
export async function preparePlayerTurn(
  session: SimSession,
  info: EntityInfo,
): Promise<void> {
  const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
  if (!worldState) throw new Error("World state lost");

  const entity = worldState.getEntity(info.id);
  if (!entity) throw new Error(`Entity "${info.id}" not found`);

  const promptBuilder = new ActorPromptBuilder(
    session.bufferRepo,
    session.ledgerRepo,
    20,
  );
  const { systemPrompt, userContext } = promptBuilder.build(worldState, entity);

  session.waitingEntity = {
    entityId: info.id,
    name: info.name,
    systemPrompt,
    userContext,
  };
  session.status = "waiting_player";
}

/**
 * Runs an autonomous NPC turn: generates prose via ActorAgent, validates
 * and persists all intents, and appends a LogEntry to the session.
 */
export async function processNpcTurn(
  session: SimSession,
  info: EntityInfo,
): Promise<void> {
  const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
  if (!worldState) throw new Error("World state lost");

  const entity = worldState.getEntity(info.id);
  if (!entity) throw new Error(`Entity "${info.id}" not found`);

  const actor = new ActorAgent(
    { actor: session.actorProvider, decoder: session.decoderProvider },
    session.bufferRepo,
    session.ledgerRepo,
    20,
  );
  const result = await actor.act(worldState, entity);

  const entry: LogEntry = {
    turn: session.turn,
    entityId: info.id,
    entityName: info.name,
    narrativeProse: result.narrativeProse,
    intents: [],
    timestamp: worldState.clock.get().toISOString(),
    rawPrompt: {
      systemPrompt: result.systemPrompt || "",
      userContext: result.userContext || "",
      components: result.promptComponents,
    },
  };

  if (
    session.actorProvider.lastCalls &&
    session.actorProvider.lastCalls.length > 0
  ) {
    const actorCall =
      session.actorProvider.lastCalls[
        session.actorProvider.lastCalls.length - 1
      ];
    entry.usage = actorCall.usage;
  }

  if (
    session.decoderProvider.lastCalls &&
    session.decoderProvider.lastCalls.length > 0
  ) {
    const decoderCall =
      session.decoderProvider.lastCalls[
        session.decoderProvider.lastCalls.length - 1
      ];
    const proseHeader = "=== NARRATIVE PROSE ===";
    const userContext = decoderCall.userContext;
    const idx = userContext.indexOf(proseHeader);

    let contextStr = userContext;
    let proseStr = "";

    if (idx !== -1) {
      contextStr = userContext.substring(0, idx).trim();
      proseStr = userContext.substring(idx).trim();
    }

    entry.decoderPrompt = {
      systemPrompt: decoderCall.systemPrompt,
      userContext: decoderCall.userContext,
      components: [
        {
          label: "System Prompt",
          type: "system",
          content: decoderCall.systemPrompt,
        },
        { label: "Decoder Context", type: "world", content: contextStr },
        { label: "Narrative Prose", type: "input", content: proseStr },
      ],
    };
    entry.decoderUsage = decoderCall.usage;
  }

  const { intentInfos, validatorCalls } = await processIntents(
    result.intents.intents,
    info.id,
    entity,
    worldState,
    session,
  );
  entry.intents = intentInfos;
  entry.validatorCalls = validatorCalls;
  entry.decodedIntents = result.intents.intents.map((intent) => ({
    type: intent.type,
    content: intent.content,
    modifiers: intent.modifiers || [],
    targetIds: intent.targetIds,
  }));

  session.log.push(entry);
  session.coreRepo.saveWorldState(worldState);
}

/**
 * Executes the player's turn using the prose they supplied.
 * Uses a `FixedProseGenerator` so the ActorAgent bypasses its LLM call and
 * returns the player's text directly.
 */
export async function executePlayerAction(
  session: SimSession,
  ctx: WaitingContext,
  prose: string,
): Promise<void> {
  const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
  if (!worldState) throw new Error("World state lost");

  const entity = worldState.getEntity(ctx.entityId);
  if (!entity) throw new Error(`Player entity "${ctx.entityId}" not found`);

  const playerActor = new ActorAgent(
    { actor: session.actorProvider, decoder: session.decoderProvider },
    session.bufferRepo,
    session.ledgerRepo,
    20,
    new FixedProseGenerator(prose),
  );

  const result = await playerActor.act(worldState, entity);

  const entry: LogEntry = {
    turn: session.turn,
    entityId: ctx.entityId,
    entityName: ctx.name,
    narrativeProse: result.narrativeProse,
    intents: [],
    timestamp: worldState.clock.get().toISOString(),
    rawPrompt: {
      systemPrompt: result.systemPrompt || ctx.systemPrompt,
      userContext: result.userContext || ctx.userContext,
      components: result.promptComponents,
    },
  };

  if (
    session.decoderProvider.lastCalls &&
    session.decoderProvider.lastCalls.length > 0
  ) {
    const call =
      session.decoderProvider.lastCalls[
        session.decoderProvider.lastCalls.length - 1
      ];
    const proseHeader = "=== NARRATIVE PROSE ===";
    const userContext = call.userContext;
    const idx = userContext.indexOf(proseHeader);

    let contextStr = userContext;
    let proseStr = "";

    if (idx !== -1) {
      contextStr = userContext.substring(0, idx).trim();
      proseStr = userContext.substring(idx).trim();
    }

    entry.decoderPrompt = {
      systemPrompt: call.systemPrompt,
      userContext: call.userContext,
      components: [
        { label: "System Prompt", type: "system", content: call.systemPrompt },
        { label: "Decoder Context", type: "world", content: contextStr },
        { label: "Narrative Prose", type: "input", content: proseStr },
      ],
    };
    entry.decoderUsage = call.usage;
  }

  const { intentInfos, validatorCalls: playerValCalls } = await processIntents(
    result.intents.intents,
    ctx.entityId,
    entity,
    worldState,
    session,
  );
  entry.intents = intentInfos;
  entry.validatorCalls = playerValCalls;
  entry.decodedIntents = result.intents.intents.map((intent) => ({
    type: intent.type,
    content: intent.content,
    modifiers: intent.modifiers || [],
    targetIds: intent.targetIds,
  }));

  session.log.push(entry);
  session.coreRepo.saveWorldState(worldState);
}
