import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  ProviderManager,
  setDbPathOverride,
  resetHasBootstrapped,
} from "../src/index.js";

describe("ProviderManager Bootstrapping & CRUD Unit Tests", () => {
  let tempDbPath: string;
  let originalGoogle: string | undefined;
  let originalOpenRouter: string | undefined;

  beforeEach(() => {
    originalGoogle = process.env.GOOGLE_API_KEY;
    originalOpenRouter = process.env.OPENROUTER_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    resetHasBootstrapped();

    // Generate a unique temp database path for this test run
    tempDbPath = path.resolve(
      process.cwd(),
      `test-settings-${Date.now()}-${Math.random().toString(36).substring(2)}.db`,
    );
    setDbPathOverride(tempDbPath);
  });

  afterEach(() => {
    setDbPathOverride(null);
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // ignore
      }
    }
    if (originalGoogle !== undefined) {
      process.env.GOOGLE_API_KEY = originalGoogle;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
    if (originalOpenRouter !== undefined) {
      process.env.OPENROUTER_API_KEY = originalOpenRouter;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  test("auto-bootstraps Gemini and OpenRouter when database is empty and environment variables are present", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key-123";
    process.env.OPENROUTER_API_KEY = "mock-openrouter-key-456";

    const list = ProviderManager.list();
    expect(list.length).toBe(3);

    const gemini = list.find((p) => p.providerName === "google-genai");
    expect(gemini).toBeDefined();
    expect(gemini?.name).toBe("Gemini (Env)");
    expect(gemini?.apiKey).toBe("mock-google-key-123");
    expect(gemini?.modelName).toBe("gemini-2.5-flash");
    expect(gemini?.isActive).toBe(true); // first inserted is active

    const openrouter = list.find((p) => p.providerName === "openrouter");
    expect(openrouter).toBeDefined();
    expect(openrouter?.name).toBe("OpenRouter (Env)");
    expect(openrouter?.apiKey).toBe("mock-openrouter-key-456");
    expect(openrouter?.modelName).toBe("google/gemini-2.5-flash");
    expect(openrouter?.isActive).toBe(false); // second inserted is inactive
  });

  test("treats bootstrapped instances as normal provider instances (editable and deletable)", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key-123";

    // Trigger bootstrap
    const list = ProviderManager.list();
    expect(list.length).toBe(2);
    const bootstrapped = list.find((p) => p.name === "Gemini (Env)");
    expect(bootstrapped).toBeDefined();
    if (!bootstrapped) return;
    expect(bootstrapped.isActive).toBe(true);

    // Edit name and key
    ProviderManager.update(
      bootstrapped.id,
      "My Gemini Key",
      "google-genai",
      "new-secret-key",
      "gemini-2.5-pro",
    );

    const listAfterUpdate = ProviderManager.list();
    expect(listAfterUpdate.length).toBe(2);
    const updated = listAfterUpdate.find((p) => p.id === bootstrapped.id);
    expect(updated).toBeDefined();
    if (!updated) return;
    expect(updated.name).toBe("My Gemini Key");
    expect(updated.apiKey).toBe("new-secret-key");
    expect(updated.modelName).toBe("gemini-2.5-pro");

    // Delete instance
    ProviderManager.delete(bootstrapped.id);
    const listAfterDelete = ProviderManager.list();
    expect(listAfterDelete.length).toBe(1);
  });
});
