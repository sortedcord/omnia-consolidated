import { z } from "zod";
import { ProviderRegistry } from "./registry.js";

let _config: Record<string, string | undefined> | null = null;

export function getLlmConfig(): Record<string, string | undefined> {
  if (!_config) {
    const envVars: string[] = [];
    for (const def of ProviderRegistry.all()) {
      if (def.envVar && !envVars.includes(def.envVar)) {
        envVars.push(def.envVar);
      }
    }
    const shape: Record<string, z.ZodOptional<z.ZodString>> = {};
    for (const key of envVars) {
      shape[key] = z.string().optional();
    }
    _config = z.object(shape).parse(process.env);
  }
  return _config;
}

export function resetLlmConfig(): void {
  _config = null;
}
