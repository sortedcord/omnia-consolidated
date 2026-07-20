import { HandoffEngine, checkHandoffTrigger } from "@omnia/memory";
import type { SimSession } from "./types";

/**
 * Runs the HandoffEngine for every agent entity that has accumulated enough
 * buffer entries to warrant a handoff (compression to the Memory Ledger).
 */
export async function runHandoffResolution(session: SimSession): Promise<void> {
  const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
  if (!worldState) throw new Error("World state lost");

  const handoffEngine = new HandoffEngine(
    session.handoffProvider,
    session.embeddingProvider,
    session.bufferRepo,
    session.ledgerRepo,
  );

  const entities = Array.from(worldState.entities.values());
  for (const entity of entities) {
    if (!entity.isAgent) continue;

    const bufferEntries = session.bufferRepo.listForOwner(entity.id);
    const maxContext =
      session.handoffProvider.maxContext !== undefined
        ? session.handoffProvider.maxContext
        : 32768;

    const trigger = checkHandoffTrigger(
      entity,
      bufferEntries,
      worldState.clock.get(),
      maxContext,
    );
    if (trigger !== "none") {
      const ran = await handoffEngine.runHandoff(
        entity,
        bufferEntries,
        worldState.clock.get(),
      );
      if (ran) {
        const lastResult = handoffEngine.lastResult;
        const lastCall =
          session.handoffProvider.lastCalls?.[
            (session.handoffProvider.lastCalls?.length || 0) - 1
          ];
        const info = session.entities.find((e) => e.id === entity.id);
        const entityName = info?.name || entity.id;

        session.log.push({
          turn: session.turn,
          entityId: entity.id,
          entityName,
          narrativeProse: `Handoff triggered for ${entityName}: memories were transferred from Cognitive Buffer to Memory Ledger`,
          intents: [],
          timestamp: worldState.clock.get().toISOString(),
          isHandoff: true,
          rawPrompt: lastResult
            ? {
                systemPrompt: lastResult.systemPrompt || "",
                userContext: lastResult.userContext || "",
                components: lastResult.promptComponents,
              }
            : undefined,
          usage: lastCall?.usage,
          handoffResult: (lastResult?.response || lastCall?.response) as any,
        });
      }
    }
  }
}

/**
 * For every agent that shares a location with another entity they haven't
 * previously encountered, generates a first-person alias description and
 * persists it on the viewing entity.
 */
export async function runAliasResolution(session: SimSession): Promise<void> {
  const worldState = session.coreRepo.loadWorldState(session.worldInstanceId);
  if (!worldState) throw new Error("World state lost");

  const entities = Array.from(worldState.entities.values());
  for (const viewer of entities) {
    if (!viewer.isAgent) continue;
    if (!viewer.locationId) continue;

    for (const target of entities) {
      if (viewer.id === target.id) continue;
      if (
        target.locationId === viewer.locationId &&
        !viewer.aliases.has(target.id)
      ) {
        const alias = await session.aliasGenerator.generate(viewer, target);
        viewer.aliases.set(target.id, alias);
        session.coreRepo.saveEntity(viewer, worldState.id);
      }
    }
  }
}
