#!/usr/bin/env node
import { ProviderRegistry, ProviderManager } from "../index.js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load dotenv from workspace root
function loadEnv() {
  let current = process.cwd();
  while (current !== "/" && current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      dotenv.config({ path: path.join(current, ".env") });
      return;
    }
    current = path.dirname(current);
  }
  dotenv.config();
}

loadEnv();

function printHelp() {
  console.log(`
Usage:
  node packages/llm/dist/bin/setup-provider.js [options]

Options:
  --provider <id>     ID of the provider (e.g. google-genai, openai, anthropic, groq, etc.)
  --name <name>       Display name for the instance (default: provider displayName)
  --key <key>         API key (default: loaded from the provider's env variable, e.g. GOOGLE_API_KEY)
  --model <model>     Model name (default: provider's default model)
  --type <type>       "generative" | "embedding" (default: "generative")
  --max-context <num> Max context window tokens (default: provider's default max context)
  --endpoint <url>    Custom endpoint URL (optional)
  --all               Auto-detect and seed all providers whose environment variables are set
  -h, --help          Show this help message

Registered Providers:
${ProviderRegistry.all()
  .map((p) => `  - ${p.id} (${p.displayName}) [Env: ${p.envVar || "None"}]`)
  .join("\n")}
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextVal = args[i + 1];
      if (nextVal && !nextVal.startsWith("--")) {
        options[key] = nextVal;
        i++;
      } else {
        options[key] = "true";
      }
    }
  }

  if (options.all === "true") {
    // Seed all providers from environment variables
    const existing = ProviderManager.list();
    let seededCount = 0;

    for (const def of ProviderRegistry.all()) {
      if (!def.envVar) continue;
      const key = process.env[def.envVar]?.trim();
      if (!key) continue;

      if (def.capabilities.generative) {
        const hasGen = existing.some(
          (p) => p.providerName === def.id && p.type === "generative",
        );
        if (!hasGen) {
          const name = `${def.displayName} (CLI)`;
          ProviderManager.create(
            name,
            def.id,
            key,
            def.defaultModel,
            "generative",
            def.defaultMaxContext,
          );
          console.log(`Created generative instance: ${name}`);
          seededCount++;
        }
      }

      if (def.capabilities.embedding) {
        const hasEmbed = existing.some(
          (p) => p.providerName === def.id && p.type === "embedding",
        );
        if (!hasEmbed) {
          const name = `${def.displayName} Embed (CLI)`;
          ProviderManager.create(
            name,
            def.id,
            key,
            def.defaultEmbeddingModel || "",
            "embedding",
            0,
          );
          console.log(`Created embedding instance: ${name}`);
          seededCount++;
        }
      }
    }

    if (seededCount === 0) {
      console.log(
        "No new provider instances seeded. (Either already existed or env vars not set)",
      );
    } else {
      console.log(`Successfully seeded ${seededCount} provider instance(s).`);
    }
    process.exit(0);
  }

  const providerId = options.provider;
  if (!providerId) {
    console.error("Error: --provider <id> or --all is required.");
    printHelp();
    process.exit(1);
  }

  const def = ProviderRegistry.get(providerId);
  if (!def) {
    console.error(`Error: Provider '${providerId}' is not registered.`);
    console.error(
      `Available providers: ${ProviderRegistry.all()
        .map((p) => p.id)
        .join(", ")}`,
    );
    process.exit(1);
  }

  const type = (options.type === "embedding" ? "embedding" : "generative") as
    "generative" | "embedding";

  // Resolve key
  let apiKey: string | undefined = options.key;
  if (!apiKey && def.envVar) {
    apiKey = process.env[def.envVar]?.trim();
  }
  if (!apiKey) {
    console.error(
      `Error: API Key is required. Please set ${def.envVar || "the environment variable"} or pass --key <apiKey>.`,
    );
    process.exit(1);
  }

  // Resolve model
  const defaultModel =
    type === "embedding" ? def.defaultEmbeddingModel || "" : def.defaultModel;
  const modelName = options.model || defaultModel;

  // Resolve name
  const name = options.name || `${def.displayName} (CLI)`;

  // Resolve maxContext
  const maxContext = options["max-context"]
    ? parseInt(options["max-context"], 10)
    : type === "embedding"
      ? 0
      : def.defaultMaxContext;

  const endpointUrl = options.endpoint;

  const instance = ProviderManager.create(
    name,
    def.id,
    apiKey,
    modelName,
    type,
    maxContext,
    endpointUrl,
  );

  console.log(`Successfully created provider instance:`);
  console.log(JSON.stringify(instance, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
