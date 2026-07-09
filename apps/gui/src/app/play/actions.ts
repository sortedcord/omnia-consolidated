"use server";

import path from "path";
import fs from "fs";
import { simulationManager } from "@/lib/simulation";
import type { SimSnapshot } from "@/lib/simulation";

function resolveScenarioPath(relative: string): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, relative),
    path.resolve(cwd, "content/demo/scenarios", relative),
    path.resolve(cwd, "../../", relative),
    path.resolve(cwd, "../../content/demo/scenarios", relative),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* not found */
    }
  }
  return path.resolve(cwd, relative);
}

type ActionResult =
  | { ok: true; snapshot: SimSnapshot }
  | { ok: false; error: string };

export async function startSimulation(input: {
  scenario?: string;
  playEntity?: string;
}): Promise<ActionResult> {
  try {
    const scenarioFile =
      input.scenario || "content/demo/scenarios/talking-room.json";

    const resolved = resolveScenarioPath(scenarioFile);
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Scenario file not found: ${scenarioFile}` };
    }

    const snapshot = await simulationManager.create(
      resolved,
      input.playEntity || undefined,
    );

    if (snapshot.status === "error") {
      return { ok: false, error: snapshot.error || "Unknown error" };
    }

    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function stepSimulation(input: {
  simId: string;
}): Promise<ActionResult> {
  try {
    if (!input.simId) {
      return { ok: false, error: "Missing simId" };
    }

    const snapshot = await simulationManager.step(input.simId);

    if (!snapshot) {
      return { ok: false, error: "Simulation session not found" };
    }

    if (snapshot.status === "error") {
      return { ok: false, error: snapshot.error || "Unknown error" };
    }

    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function submitPlayerAction(input: {
  simId: string;
  prose: string;
}): Promise<ActionResult> {
  try {
    if (!input.simId || !input.prose.trim()) {
      return { ok: false, error: "Missing simId or prose" };
    }

    const snapshot = await simulationManager.submitPlayerAction(
      input.simId,
      input.prose.trim(),
    );

    if (!snapshot) {
      return { ok: false, error: "Simulation session not found" };
    }

    if (snapshot.status === "error") {
      return { ok: false, error: snapshot.error || "Unknown error" };
    }

    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getConfigStatus(): Promise<{
  apiKeySet: boolean;
  apiKeyPreview: string;
  model: string;
  availableScenarios: { path: string; name: string }[];
}> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const scenarios: { path: string; name: string }[] = [];

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "content/demo/scenarios"),
    path.resolve(cwd, "../../content/demo/scenarios"),
  ];
  let scenariosDir = "";
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      scenariosDir = c;
      break;
    }
  }

  if (scenariosDir) {
    for (const file of fs.readdirSync(scenariosDir)) {
      if (file.endsWith(".json")) {
        try {
          const fullPath = path.join(scenariosDir, file);
          const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          scenarios.push({
            path: `content/demo/scenarios/${file}`,
            name: content.name || file,
          });
        } catch {
          /* skip invalid */
        }
      }
    }
  }

  return {
    apiKeySet: !!apiKey,
    apiKeyPreview: apiKey ? apiKey.substring(0, 10) + "..." : "NOT SET",
    model: "gemini-2.5-flash",
    availableScenarios: scenarios,
  };
}

export async function listSavedSimulations(): Promise<
  | { ok: true; sessions: SimSnapshot[] }
  | { ok: false; error: string }
> {
  try {
    const sessions = simulationManager.listSavedSessions();
    return { ok: true, sessions };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function resumeSimulation(simId: string): Promise<ActionResult> {
  try {
    const snapshot = await simulationManager.load(simId);
    if (!snapshot) {
      return { ok: false, error: `Failed to load simulation: ${simId}` };
    }
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getScenarioEntities(scenarioPath: string): Promise<
  | { ok: true; entities: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  try {
    const resolved = resolveScenarioPath(scenarioPath);
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Scenario file not found: ${scenarioPath}` };
    }
    const content = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const entities = (content.entities || []).map((e: { id: string; name?: string }) => ({
      id: e.id,
      name: e.name || e.id,
    }));
    return { ok: true, entities };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deleteSimulation(simId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    simulationManager.deleteSession(simId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
