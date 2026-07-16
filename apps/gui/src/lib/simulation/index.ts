/**
 * Barrel entry point for the simulation module.
 *
 * Consumers import from "@/lib/simulation" exactly as before — no import
 * paths need to change anywhere in the codebase.
 */
import { SimulationManager } from "./simulation-manager";

export const simulationManager = new SimulationManager();

export type {
  SimSnapshot,
  EntityInfo,
  LogEntry,
  IntentInfo,
  WaitingContext,
} from "../simulation-types";
