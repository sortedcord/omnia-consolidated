import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { ProviderManager, setDbPathOverride } from "../src/index.js";

describe("ProviderManager Bootstrapping & CRUD Unit Tests", () => {
  let tempDbPath: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    };
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

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
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  test("returns empty list when database is empty and no auto-bootstraps", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key";
    const list = ProviderManager.list();
    expect(list.length).toBe(0);
  });

  test("getActive returns null when no providers exist and no env vars", () => {
    const active = ProviderManager.getActive("generative");
    expect(active).toBeNull();
    const activeEmbed = ProviderManager.getActive("embedding");
    expect(activeEmbed).toBeNull();
  });

  test("getActive returns null when DB is empty", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key-123";
    const active = ProviderManager.getActive("generative");
    expect(active).toBeNull();
  });

  test("getActive returns first instance of type when none is active", () => {
    // Manually create instances without any env var bootstrap
    const inst1 = ProviderManager.create("Test Gemini", "google-genai", "key1");
    const inst2 = ProviderManager.create(
      "Test OpenAI",
      "openai",
      "key2",
      "gpt-4o",
      "generative",
      128000,
    );
    expect(inst1.isActive).toBe(true); // first created auto-activates
    expect(inst2.isActive).toBe(false);

    // Deactivate both
    ProviderManager.setActive("__nonexistent__"); // no-op for nonexistent

    // Deactivate inst1 by setting another as active, then delete that
    ProviderManager.setActive(inst2.id);
    expect(
      ProviderManager.list().find((p) => p.id === inst2.id)?.isActive,
    ).toBe(true);
    expect(
      ProviderManager.list().find((p) => p.id === inst1.id)?.isActive,
    ).toBe(false);

    // Delete the active one → auto-promotes inst1
    ProviderManager.delete(inst2.id);
    const promoted = ProviderManager.list().find((p) => p.id === inst1.id);
    expect(promoted?.isActive).toBe(true);
  });

  test("setActive correctly deactivates siblings and activates target", () => {
    const inst1 = ProviderManager.create(
      "First Gemini",
      "google-genai",
      "key1",
      undefined,
      "generative",
    );
    const inst2 = ProviderManager.create(
      "Second Gemini",
      "google-genai",
      "key2",
      undefined,
      "generative",
    );

    expect(inst1.isActive).toBe(true);
    expect(inst2.isActive).toBe(false);

    ProviderManager.setActive(inst2.id);

    const list = ProviderManager.list();
    const updated1 = list.find((p) => p.id === inst1.id);
    const updated2 = list.find((p) => p.id === inst2.id);
    expect(updated1?.isActive).toBe(false);
    expect(updated2?.isActive).toBe(true);
  });

  test("getMappings returns empty object initially, setMapping persists mappings", () => {
    const mappings = ProviderManager.getMappings();
    expect(mappings).toEqual({});

    const inst = ProviderManager.create(
      "Test Provider",
      "google-genai",
      "key1",
    );

    ProviderManager.setMapping("actor-prose", inst.id);
    ProviderManager.setMapping("embeddings", inst.id);

    const updated = ProviderManager.getMappings();
    expect(updated["actor-prose"]).toBe(inst.id);
    expect(updated["embeddings"]).toBe(inst.id);
  });

  test("setMapping with empty providerInstanceId deletes the mapping", () => {
    const inst = ProviderManager.create(
      "Test Provider",
      "google-genai",
      "key1",
    );

    ProviderManager.setMapping("test-task", inst.id);
    expect(ProviderManager.getMappings()["test-task"]).toBe(inst.id);

    ProviderManager.setMapping("test-task", "");
    expect(ProviderManager.getMappings()["test-task"]).toBeUndefined();
  });

  test("create returns instance with correct fields and endpointUrl support", () => {
    const inst = ProviderManager.create(
      "Ollama Local",
      "ollama",
      "",
      "llama3.1",
      "generative",
      32768,
      "http://localhost:11434",
    );

    expect(inst.id).toMatch(/^provider-/);
    expect(inst.name).toBe("Ollama Local");
    expect(inst.providerName).toBe("ollama");
    expect(inst.modelName).toBe("llama3.1");
    expect(inst.endpointUrl).toBe("http://localhost:11434");
  });

  test("update preserves apiKey when not provided", () => {
    const inst = ProviderManager.create(
      "Original",
      "openai",
      "original-key",
      "gpt-4o",
      "generative",
      128000,
    );

    ProviderManager.update(
      inst.id,
      "Renamed",
      "openai",
      undefined, // no apiKey → preserve existing
      "gpt-4o-mini",
      "generative",
      64000,
    );

    const updated = ProviderManager.list().find((p) => p.id === inst.id);
    expect(updated?.name).toBe("Renamed");
    expect(updated?.apiKey).toBe("original-key"); // preserved
    expect(updated?.modelName).toBe("gpt-4o-mini");
    expect(updated?.maxContext).toBe(64000);
  });
  test("treats created instances as normal provider instances (editable and deletable)", () => {
    const inst = ProviderManager.create(
      "Google Gemini (Env)",
      "google-genai",
      "mock-google-key-123",
      "gemini-2.5-flash",
      "generative",
    );

    const list = ProviderManager.list();
    expect(list.length).toBe(1);
    const created = list.find((p) => p.id === inst.id);
    expect(created).toBeDefined();
    if (!created) return;
    expect(created.isActive).toBe(true);

    // Edit name and key
    ProviderManager.update(
      created.id,
      "My Gemini Key",
      "google-genai",
      "new-secret-key",
      "gemini-2.5-pro",
    );

    const listAfterUpdate = ProviderManager.list();
    expect(listAfterUpdate.length).toBe(1);
    const updated = listAfterUpdate.find((p) => p.id === created.id);
    expect(updated).toBeDefined();
    if (!updated) return;
    expect(updated.name).toBe("My Gemini Key");
    expect(updated.apiKey).toBe("new-secret-key");
    expect(updated.modelName).toBe("gemini-2.5-pro");

    // Delete instance
    ProviderManager.delete(created.id);
    const listAfterDelete = ProviderManager.list();
    expect(listAfterDelete.length).toBe(0);
  });
});
