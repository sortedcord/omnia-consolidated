/**
 * Monorepo Hygiene Note:
 * If a pure function only touches types owned by core (e.g., Entity, WorldState, Attribute),
 * it belongs here in the core package (e.g., in a dedicated file like alias.ts), even if
 * a higher-level package is currently its only consumer.
 */
export * from "./attribute.js";
export * from "./entity.js";
export * from "./world.js";
export * from "./clock.js";
export * from "./repository.js";
export * from "./alias.js";
