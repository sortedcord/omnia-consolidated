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

  test("auto-bootstraps all environment-variable providers when database is empty", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key";
    process.env.OPENROUTER_API_KEY = "mock-openrouter-key";
    process.env.ANTHROPIC_API_KEY = "mock-anthropic-key";
    process.env.OPENAI_API_KEY = "mock-openai-key";
    process.env.GROQ_API_KEY = "mock-groq-key";
    process.env.DEEPSEEK_API_KEY = "mock-deepseek-key";

    const list = ProviderManager.list();

    const providers = list.map((p) => p.providerName);
    expect(providers).toContain("google-genai");
    expect(providers).toContain("openrouter");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("groq");
    expect(providers).toContain("deepseek");

    // Gemini should have both generative + embedding (2 entries)
    const geminiEntries = list.filter((p) => p.providerName === "google-genai");
    expect(geminiEntries.length).toBe(2);
    expect(geminiEntries.some((p) => p.type === "generative")).toBe(true);
    expect(geminiEntries.some((p) => p.type === "embedding")).toBe(true);

    // OpenAI should have both generative + embedding (2 entries)
    const openaiEntries = list.filter((p) => p.providerName === "openai");
    expect(openaiEntries.length).toBe(2);
    expect(openaiEntries.some((p) => p.type === "generative")).toBe(true);
    expect(openaiEntries.some((p) => p.type === "embedding")).toBe(true);

    // First generative provider inserted should be active
    const activeGenerative = list.filter(
      (p) => p.type === "generative" && p.isActive,
    );
    expect(activeGenerative.length).toBe(1);

    // First embedding provider inserted should be active
    const activeEmbedding = list.filter(
      (p) => p.type === "embedding" && p.isActive,
    );
    expect(activeEmbedding.length).toBe(1);
  });

  test("getActive returns null when no providers exist and no env vars", () => {
    const active = ProviderManager.getActive("generative");
    expect(active).toBeNull();
    const activeEmbed = ProviderManager.getActive("embedding");
    expect(activeEmbed).toBeNull();
  });

  test("getActive falls back to env var when DB operations fail or return null", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key-123";
    // DB is empty, getActive should bootstrap and find or create from env
    const active = ProviderManager.getActive("generative");
    expect(active).not.toBeNull();
    expect(active?.providerName).toBe("google-genai");
    expect(active?.apiKey).toBe("mock-google-key-123");
    expect(active?.type).toBe("generative");

    const activeEmbed = ProviderManager.getActive("embedding");
    expect(activeEmbed).not.toBeNull();
    expect(activeEmbed?.providerName).toBe("google-genai");
    expect(activeEmbed?.type).toBe("embedding");
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
  test("treats bootstrapped instances as normal provider instances (editable and deletable)", () => {
    process.env.GOOGLE_API_KEY = "mock-google-key-123";

    // Trigger bootstrap
    const list = ProviderManager.list();
    expect(list.length).toBe(2);
    const bootstrapped = list.find((p) => p.name === "Google Gemini (Env)");
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
