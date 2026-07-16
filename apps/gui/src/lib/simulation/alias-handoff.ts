import { HandoffEngine, checkHandoffTrigger } from "@omnia/memory";
import type { SimSession } from "./types";

/**
 * Runs the HandoffEngine for every agent entity that has accumulated enough
 * buffer entries to warrant a handoff (compression to long-term memory).
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
      await handoffEngine.runHandoff(
        entity,
        bufferEntries,
        worldState.clock.get(),
      );
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
