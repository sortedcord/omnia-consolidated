import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

describe("setup-provider CLI Tool Tests", () => {
  let tempDbPath: string;
  let scriptPath: string;

  beforeEach(() => {
    // Generate a unique temp database path
    tempDbPath = path.resolve(
      process.cwd(),
      `test-cli-${Date.now()}-${Math.random().toString(36).substring(2)}.db`,
    );
    scriptPath = path.resolve(
      process.cwd(),
      "packages/llm/dist/bin/setup-provider.js",
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // ignore
      }
    }
  });

  test("prints help message when --help or -h is passed", () => {
    const stdout = execSync(`node ${scriptPath} --help`).toString();
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("Options:");
    expect(stdout).toContain("Registered Providers:");
  });

  test("creates a provider instance successfully via CLI flags", () => {
    const cmd = `node ${scriptPath} --provider google-genai --key mock-key-abc --name "Test Gemini" --model "gemini-2.5-flash"`;
    const stdout = execSync(cmd, {
      env: { ...process.env, OMNIA_DB_PATH: tempDbPath },
    }).toString();

    expect(stdout).toContain("Successfully created provider instance:");
    expect(stdout).toContain("Test Gemini");
    expect(stdout).toContain("google-genai");
    expect(stdout).toContain("mock-key-abc");

    // Read the SQLite db directly to verify
    const db = new Database(tempDbPath);
    const rows = db.prepare("SELECT * FROM provider_instances").all() as {
      name: string;
      providerName: string;
      apiKey: string;
      modelName: string;
      isActive: number;
    }[];
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Test Gemini");
    expect(rows[0].providerName).toBe("google-genai");
    expect(rows[0].apiKey).toBe("mock-key-abc");
    expect(rows[0].modelName).toBe("gemini-2.5-flash");
    expect(rows[0].isActive).toBe(1);
    db.close();
  });

  test("fails when required key is missing and env var is not set", () => {
    let error: { status?: number; stderr?: Buffer } | undefined;
    try {
      execSync(`node ${scriptPath} --provider google-genai`, {
        env: { ...process.env, OMNIA_DB_PATH: tempDbPath, GOOGLE_API_KEY: "" },
        stdio: "pipe",
      });
    } catch (e) {
      error = e as { status?: number; stderr?: Buffer };
    }
    expect(error).toBeDefined();
    expect(error?.status).toBe(1);
    expect(error?.stderr?.toString()).toContain("Error: API Key is required");
  });

  test("seeds from environment variables when using --all", () => {
    const cmd = `node ${scriptPath} --all`;
    const stdout = execSync(cmd, {
      env: {
        ...process.env,
        OMNIA_DB_PATH: tempDbPath,
        GOOGLE_API_KEY: "mock-google-key-all",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        GROQ_API_KEY: "",
        DEEPSEEK_API_KEY: "",
        OPENROUTER_API_KEY: "",
      },
    }).toString();

    expect(stdout).toContain(
      "Created generative instance: Google Gemini (CLI)",
    );
    expect(stdout).toContain(
      "Created embedding instance: Google Gemini Embed (CLI)",
    );

    const db = new Database(tempDbPath);
    const rows = db.prepare("SELECT * FROM provider_instances").all() as {
      type: string;
      apiKey: string;
      modelName: string;
    }[];
    // Should have both generative and embedding instances
    expect(rows.length).toBe(2);
    const gen = rows.find((r) => r.type === "generative");
    const embed = rows.find((r) => r.type === "embedding");

    expect(gen).toBeDefined();
    expect(gen?.apiKey).toBe("mock-google-key-all");
    expect(gen?.modelName).toBe("gemini-2.5-flash");

    expect(embed).toBeDefined();
    expect(embed?.apiKey).toBe("mock-google-key-all");
    expect(embed?.modelName).toBe("gemini-embedding-001");
    db.close();
  });
});
