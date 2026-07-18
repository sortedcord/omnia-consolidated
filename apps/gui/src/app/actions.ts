"use server";

import path from "path";
import fs from "fs";
import { simulationManager } from "@/lib/simulation";
import type { SimSnapshot } from "@/lib/simulation";
import {
  ProviderManager,
  ModelProviderInstance,
  getAvailableProviders as listAvailableProviders,
  ModelProviderMeta,
  ModelLister,
  ModelInfo,
} from "@omnia/llm";

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
  { ok: true; snapshot: SimSnapshot } | { ok: false; error: string };

export async function startSimulation(input: {
  scenario?: string;
  playEntity?: string;
  providerInstanceId?: string;
  customName?: string;
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
      input.providerInstanceId,
      input.customName,
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
  availableScenarios: { path: string; name: string; description: string }[];
}> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const scenarios: { path: string; name: string; description: string }[] = [];

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
            description: content.description || "",
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
  { ok: true; sessions: SimSnapshot[] } | { ok: false; error: string }
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

export async function getScenarioEntities(
  scenarioPath: string,
): Promise<
  | { ok: true; entities: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  try {
    const resolved = resolveScenarioPath(scenarioPath);
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Scenario file not found: ${scenarioPath}` };
    }
    const content = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const entities = (content.entities || []).map(
      (e: { id: string; name?: string }) => ({
        id: e.id,
        name: e.name || e.id,
      }),
    );
    return { ok: true, entities };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deleteSimulation(
  simId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

export async function listProviderInstances(): Promise<
  ModelProviderInstance[]
> {
  return ProviderManager.list();
}

export async function createProviderInstance(
  name: string,
  providerName: string,
  apiKey: string,
  modelName?: string,
  type: "generative" | "embedding" = "generative",
  maxContext?: number,
  endpointUrl?: string,
): Promise<ModelProviderInstance> {
  return ProviderManager.create(
    name,
    providerName,
    apiKey,
    modelName,
    type,
    maxContext,
    endpointUrl,
  );
}

export async function deleteProviderInstance(id: string): Promise<void> {
  ProviderManager.delete(id);
}

export async function setActiveProviderInstance(id: string): Promise<void> {
  ProviderManager.setActive(id);
}

export async function updateProviderInstance(
  id: string,
  name: string,
  providerName: string,
  apiKey?: string,
  modelName?: string,
  type: "generative" | "embedding" = "generative",
  maxContext?: number,
  endpointUrl?: string,
): Promise<void> {
  ProviderManager.update(
    id,
    name,
    providerName,
    apiKey,
    modelName,
    type,
    maxContext,
    endpointUrl,
  );
}

export async function getProviderMappings(): Promise<Record<string, string>> {
  return ProviderManager.getMappings();
}

export async function setProviderMapping(
  task: string,
  providerInstanceId: string,
): Promise<void> {
  ProviderManager.setMapping(task, providerInstanceId);
}

export async function getAvailableProviders(): Promise<ModelProviderMeta[]> {
  return listAvailableProviders();
}

export async function regenerateEmbeddings(
  newProviderInstanceId?: string,
): Promise<void> {
  await simulationManager.regenerateAllEmbeddings(newProviderInstanceId);
}

/**
 * Fetch available models for a provider given its credentials.
 * Used when creating a new instance (before it's saved to the DB).
 */
export async function fetchAvailableModels(
  providerName: string,
  apiKey: string,
  endpointUrl?: string,
): Promise<ModelInfo[]> {
  return ModelLister.listModels(providerName, apiKey, endpointUrl);
}

/**
 * Fetch available models for an existing saved provider instance.
 * The API key is retrieved from the DB server-side — never sent to the client.
 */
export async function fetchAvailableModelsForInstance(
  instanceId: string,
): Promise<ModelInfo[]> {
  const instances = ProviderManager.list();
  const inst = instances.find((i) => i.id === instanceId);
  if (!inst) return [];
  return ModelLister.listModels(
    inst.providerName,
    inst.apiKey,
    inst.endpointUrl,
  );
}

export async function renameSimulation(
  simId: string,
  newName: string,
): Promise<{ ok: true; snapshot: SimSnapshot } | { ok: false; error: string }> {
  try {
    const snapshot = await simulationManager.rename(simId, newName);
    if (!snapshot) {
      return { ok: false, error: "Simulation session not found" };
    }
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to rename simulation",
    };
  }
}
