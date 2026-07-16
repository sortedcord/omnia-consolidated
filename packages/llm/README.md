# @omnia/llm

LLM abstraction layer providing pluggable, database-backed provider instances for generative and embedding tasks.

## Architecture Overview

The system is built around four layers:

1. **Registry** — each provider class self-registers its metadata (id, envVar, capabilities, default model, etc.) via `static {}` blocks; `PROVIDER_REGISTRY` is derived from these registrations at runtime — there is no hand-maintained provider list
2. **Provider Manager** — SQLite-backed CRUD for persisted provider instances, with env-var bootstrap driven by the registry
3. **Provider Factory** — `buildLLMProvider(inst)` / `buildEmbeddingProvider(inst)` resolve a stored instance to a live provider class via the registry
4. **Interfaces** — contracts that all providers implement

```mermaid
graph TD
    subgraph Self-Registering Providers
        GP["GeminiProvider"]
        ORP["OpenRouterProvider"]
        MP["MockLLMProvider"]
        GEP["GeminiEmbeddingProvider"]
        MEP["MockEmbeddingProvider"]
    end

    subgraph Registry
        PR["ProviderRegistry\n(derived, not authored)"]
    end

    subgraph Storage
        PM["ProviderManager\n(db.ts + bootstrap.ts + row-mapper.ts)"]
        DB[("settings.db")]
    end

    subgraph Factory
        PF["buildLLMProvider()\nbuildEmbeddingProvider()"]
    end

    GP -->|static block| PR
    ORP -->|static block| PR
    MP -->|static block| PR
    GEP -->|static block| PR
    MEP -->|static block| PR

    PM -->|reads/writes| DB
    PM -->|bootstrap from| PR

    PF -->|looks up| PR
    PF -->|instantiates| GP
    PF -->|instantiates| ORP
```

## Core Interfaces

Defined in [`llm.ts`](src/llm.ts):

### `ILLMProvider`

The primary contract for generative (text-to-structured-data) providers.

| Member                                   | Type                      | Description                                                |
| ---------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `providerName`                           | `string`                  | Human-readable provider label                              |
| `maxContext`                             | `number?`                 | Maximum context window in tokens                           |
| `generateStructuredResponse<T>(request)` | `Promise<LLMResponse<T>>` | Sends a prompt + Zod schema → returns parsed, typed output |
| `lastCalls`                              | `LLMCallRecord[]?`        | Audit trail of recent calls (prompts + usage)              |

### `IEmbeddingProvider`

Contract for text-to-vector embedding providers.

| Member         | Type                | Description                                        |
| -------------- | ------------------- | -------------------------------------------------- |
| `providerName` | `string`            | Human-readable provider label                      |
| `embed(text)`  | `Promise<number[]>` | Returns a dense vector embedding of the input text |

### `LLMRequest<T>`

Input to `generateStructuredResponse`:

```typescript
{
  systemPrompt: string;    // System-level instructions
  userContext:   string;    // User/task-specific context
  schema:        T;         // Zod schema — output is validated against this
  temperature?:  number;    // Sampling temperature (optional)
}
```

### `LLMResponse<T>`

Output from `generateStructuredResponse`:

```typescript
{
  success: boolean;
  data?:   T;               // Parsed, schema-validated output
  error?:  string;          // Error message on failure
  usage?:  {
    inputTokens:          number;
    outputTokens:         number;
    totalTokens:          number;
    modelName?:           string;
    providerInstanceName?: string;
    maxContext?:           number;
  };
}
```

### `ModelProviderInstance`

The persisted configuration record for a single provider instance:

```typescript
{
  id:           string;                     // Unique ID ("provider-<timestamp>")
  name:         string;                     // User-facing name ("Gemini (Env)")
  providerName: string;                     // Provider type key ("google-genai" | "openrouter" | "mock")
  apiKey:       string;                     // API key
  isActive:     boolean;                    // Whether this is the active instance for its type
  modelName?:   string;                     // Specific model to use
  type:         "generative" | "embedding"; // Instance category
  maxContext?:  number;                     // Context window limit
}
```

### `ModelProviderMeta`

Static metadata for each available provider type (used by the UI's provider picker):

| Member                  | Type     | Description                                                  |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `id`                    | `string` | `"google-genai"` \| `"openrouter"` \| `"ollama"` \| `"mock"` |
| `displayName`           | `string` | Human-readable name                                          |
| `description`           | `string` | Human-readable description                                   |
| `defaultModel`          | `string` | Default generative model                                     |
| `defaultEmbeddingModel` | `string` | Default embedding model                                      |

Provider metadata is **self-declared** by each provider class in a `static {}` block and collected into `PROVIDER_REGISTRY` (derived, not authored). The `getAvailableProviders()` function and `AVAILABLE_PROVIDERS` helper in [`llm.ts`](src/llm.ts) read from the registry at call time.

## Provider Manager

`ProviderManager` is a **static class** that provides full CRUD over provider instances, backed by a SQLite database (`data/settings.db` at the workspace root). Internally split across:

- [`db.ts`](src/db.ts) — memoized DB handle + schema migrations (`PRAGMA user_version`)
- [`bin/setup-provider.ts`](src/bin/setup-provider.ts) — CLI tool to set up provider instances in the database
- [`row-mapper.ts`](src/row-mapper.ts) — `mapRow()` (written once, used everywhere)
- [`provider-manager.ts`](src/provider-manager.ts) — thin CRUD: `list`, `create`, `delete`, `setActive`, `update`, `getActive`, `getMappings`, `setMapping`

### Storage

The database is auto-created on first access. The table schema:

```sql
CREATE TABLE IF NOT EXISTS provider_instances (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  providerName TEXT NOT NULL,
  apiKey       TEXT NOT NULL,
  isActive     INTEGER NOT NULL DEFAULT 0,
  modelName    TEXT,
  type         TEXT NOT NULL DEFAULT 'generative',
  maxContext   INTEGER
);
```

A second table stores per-task provider overrides:

```sql
CREATE TABLE IF NOT EXISTS provider_mappings (
  task                TEXT PRIMARY KEY,
  providerInstanceId  TEXT NOT NULL
);
```

### API

| Method                                                                    | Signature                         | Description                                                                               |
| ------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `list()`                                                                  | `→ ModelProviderInstance[]`       | Returns all saved instances                                                               |
| `create(name, providerName, apiKey, modelName?, type?, maxContext?)`      | `→ ModelProviderInstance`         | Creates a new instance. Auto-activates if it's the first of its type                      |
| `delete(id)`                                                              | `→ void`                          | Removes an instance. If it was active, auto-promotes the next instance of the same type   |
| `setActive(id)`                                                           | `→ void`                          | Deactivates all instances of the same type, then activates the target                     |
| `update(id, name, providerName, apiKey?, modelName?, type?, maxContext?)` | `→ void`                          | Updates an existing instance. If `apiKey` is empty/omitted, the existing key is preserved |
| `getActive(type?)`                                                        | `→ ModelProviderInstance \| null` | Returns the currently active instance for the given type (`"generative"` by default)      |
| `getMappings()`                                                           | `→ Record<string, string>`        | Returns all task → providerInstanceId mappings                                            |
| `setMapping(task, providerInstanceId)`                                    | `→ void`                          | Sets or removes (if `providerInstanceId` is empty) a task-specific mapping                |

### Active Instance Invariants

- **Only one active instance per type** — `setActive()` deactivates all sibling instances before activating the target.
- **Auto-promotion on delete** — if the deleted instance was active, the first remaining instance of the same type is promoted.
- **Auto-activation on create** — if no active instance exists for the type, the new instance is automatically activated.

### Manual Seeding via CLI

Rather than automatically bootstrapping from environment variables at runtime, which adds runtime complexity, you can quickly seed the database using the CLI setup tool:

#### Seeding All Environment-Variable Providers

```bash
pnpm setup-provider --all
```

This command auto-detects and inserts provider instances into `data/settings.db` for any registered providers whose corresponding environment variables (such as `GOOGLE_API_KEY`, `OPENAI_API_KEY`, etc.) are defined.

#### Creating a Specific Provider Instance

```bash
pnpm setup-provider --provider google-genai --key YOUR_API_KEY [--name "My Gemini"] [--model gemini-2.5-flash] [--type generative] [--max-context 32768] [--endpoint url]
```

### Credential Resolution Cascade

When initializing a provider (e.g. `new GeminiProvider()`):

1. **Explicit Credentials** — If `apiKey`, `modelName`, etc. are passed directly to the constructor, they are used.
2. **Active DB Instance** — If not explicitly passed, it looks up the active DB instance via `ProviderManager.getActive()`. If found and matches the provider, its API key and configuration are used.
3. **Environment Fallback** — If there is no matching active DB instance, it resolves the key directly from the corresponding environment variable (e.g., `GOOGLE_API_KEY`) via `resolveCredentials`.

## Available Providers

### Google Gemini — `GeminiProvider`

| Property                    | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| **File**                    | [`providers/google-genai.ts`](src/providers/google-genai.ts) |
| **Provider ID**             | `google-genai`                                               |
| **SDK**                     | `@langchain/google-genai` (`ChatGoogleGenerativeAI`)         |
| **Default Model**           | `gemini-2.5-flash`                                           |
| **Default Embedding Model** | `gemini-embedding-001`                                       |
| **Default Max Context**     | `32768`                                                      |
| **Type**                    | Generative                                                   |

**Key resolution** in the constructor follows this cascade:

```
1. Explicit apiKey argument       → use it
2. ProviderManager.getActive()    → if providerName matches "google-genai"
3. GOOGLE_API_KEY env var         → final fallback
4. None found                     → throw Error
```

Also exports `GeminiEmbeddingProvider` (implements `IEmbeddingProvider`) using the same key resolution pattern but querying for the `"embedding"` type.

### Anthropic Claude — `AnthropicProvider`

| Property                    | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| **File**                    | [`providers/anthropic.ts`](src/providers/anthropic.ts) |
| **Provider ID**             | `anthropic`                                            |
| **SDK**                     | `@langchain/anthropic` (`ChatAnthropic`)               |
| **Default Model**           | `claude-3-5-sonnet-latest`                             |
| **Default Embedding Model** | _(none)_                                               |
| **Default Max Context**     | `200000`                                               |
| **Type**                    | Generative only (no embedding provider)                |

**Key resolution** in the constructor follows this cascade:

```
1. Explicit apiKey argument       → use it
2. ProviderManager.getActive()    → if providerName matches "anthropic"
3. ANTHROPIC_API_KEY env var      → final fallback
4. None found                     → throw Error
```

### Groq — `GroqProvider`

| Property                    | Value                                        |
| --------------------------- | -------------------------------------------- |
| **File**                    | [`providers/groq.ts`](src/providers/groq.ts) |
| **Provider ID**             | `groq`                                       |
| **SDK**                     | `@langchain/groq` (`ChatGroq`)               |
| **Default Model**           | `llama-3.3-70b-versatile`                    |
| **Default Embedding Model** | _(none)_                                     |
| **Default Max Context**     | `8192`                                       |
| **Type**                    | Generative only (no embedding provider)      |

**Key resolution** in the constructor follows this cascade:

```
1. Explicit apiKey argument       → use it
2. ProviderManager.getActive()    → if providerName matches "groq"
3. GROQ_API_KEY env var           → final fallback
4. None found                     → throw Error
```

### DeepSeek — `DeepSeekProvider`

| Property                    | Value                                                |
| --------------------------- | ---------------------------------------------------- |
| **File**                    | [`providers/deepseek.ts`](src/providers/deepseek.ts) |
| **Provider ID**             | `deepseek`                                           |
| **SDK**                     | `@langchain/deepseek` (`ChatDeepSeek`)               |
| **Default Model**           | `deepseek-chat`                                      |
| **Default Embedding Model** | _(none)_                                             |
| **Default Max Context**     | `64000`                                              |
| **Type**                    | Generative only (no embedding provider)              |

**Key resolution** in the constructor follows this cascade:

```
1. Explicit apiKey argument       → use it
2. ProviderManager.getActive()    → if providerName matches "deepseek"
3. DEEPSEEK_API_KEY env var       → final fallback
4. None found                     → throw Error
```

### OpenAI — `OpenAIProvider`

| Property                    | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| **File**                    | [`providers/openai.ts`](src/providers/openai.ts)       |
| **Provider ID**             | `openai`                                               |
| **SDK**                     | `@langchain/openai` (`ChatOpenAI`, `OpenAIEmbeddings`) |
| **Default Model**           | `gpt-4o-mini`                                          |
| **Default Embedding Model** | `text-embedding-3-small`                               |
| **Default Max Context**     | `128000`                                               |
| **Type**                    | Generative + Embedding                                 |

**Key resolution** in the constructor follows this cascade:

```
1. Explicit apiKey argument       → use it
2. ProviderManager.getActive()    → if providerName matches "openai"
3. OPENAI_API_KEY env var         → final fallback
4. None found                     → throw Error
```

Also exports `OpenAIEmbeddingProvider` (implements `IEmbeddingProvider`) using the same key resolution pattern against the `"embedding"` type instance. The default embedding model is `text-embedding-3-small`.

### OpenRouter — `OpenRouterProvider`

| Property                    | Value                                                    |
| --------------------------- | -------------------------------------------------------- |
| **File**                    | [`providers/openrouter.ts`](src/providers/openrouter.ts) |
| **Provider ID**             | `openrouter`                                             |
| **SDK**                     | `@langchain/openrouter` (`ChatOpenRouter`)               |
| **Default Model**           | `google/gemini-2.5-flash`                                |
| **Default Embedding Model** | `openai/text-embedding-3-small`                          |
| **Default Max Context**     | `32768`                                                  |
| **Type**                    | Generative only (no embedding provider)                  |

Same three-step key resolution as Gemini (`explicit → ProviderManager → env var`), using `OPENROUTER_API_KEY`.

### Ollama — `OllamaProvider`

| Property                    | Value                                            |
| --------------------------- | ------------------------------------------------ |
| **File**                    | [`providers/ollama.ts`](src/providers/ollama.ts) |
| **Provider ID**             | `ollama`                                         |
| **SDK**                     | `@langchain/ollama` (`ChatOllama`)               |
| **Default Model**           | `llama3.1`                                       |
| **Default Embedding Model** | `nomic-embed-text`                               |
| **Default Max Context**     | `32768`                                          |
| **Type**                    | Generative + Embedding                           |

Ollama runs **locally** — no API key is required. The `endpointUrl` field in `ModelProviderInstance` stores the Ollama server base URL (default: `http://localhost:11434`).

**Key resolution** in the constructor:

```
1. Explicit baseUrl argument        → use it
2. ProviderManager.getActive()      → if providerName matches "ollama"
                                      (endpointUrl field = base URL)
3. Default                          → http://localhost:11434
```

Also exports `OllamaEmbeddingProvider` (implements `IEmbeddingProvider`), which uses the same resolution pattern against the `"embedding"` type instance. The default embedding model is `nomic-embed-text`.

> [!TIP]
> To get started: `ollama pull llama3.1` and `ollama pull nomic-embed-text`. Then create a provider instance with `endpointUrl` = `http://localhost:11434`.

### Mock — `MockLLMProvider`

| Property        | Value                                        |
| --------------- | -------------------------------------------- |
| **File**        | [`providers/mock.ts`](src/providers/mock.ts) |
| **Provider ID** | `mock`                                       |
| **Type**        | Generative + Embedding                       |

Stateless mock for testing and offline development:

- **Generative** (`MockLLMProvider`): Takes an array of canned responses at construction. Returns them in order, one per call. Returns `{ success: false, error: "Mock responses exhausted" }` when depleted.
- **Embedding** (`MockEmbeddingProvider`): Returns a deterministic 768-dimensional vector derived from the input text using `Math.sin`.

## Provider Resolution (Runtime)

The [`resolveProviders()`](../../../apps/gui/src/lib/simulation/provider-resolver.ts) function (in `apps/gui`) instantiates all providers needed for a simulation session. It resolves **six** provider slots:

| Slot                | Type       | Task Key           |
| ------------------- | ---------- | ------------------ |
| `actorProvider`     | Generative | `"actor-prose"`    |
| `validatorProvider` | Generative | `"llm-validator"`  |
| `decoderProvider`   | Generative | `"intent-decoder"` |
| `timedeltaProvider` | Generative | `"timedelta"`      |
| `handoffProvider`   | Generative | `"handoff"`        |
| `embeddingProvider` | Embedding  | `"embeddings"`     |

### Generative Resolution Order

For each generative slot (`resolveGenerative(task)`):

```
1. Task-specific mapping     → mappings[task] → find instance by ID
2. Active generative instance → ProviderManager.getActive("generative")
3. Fallback instance         → options.fallbackInstance (if provided)
4. GOOGLE_API_KEY env var    → auto-create via ProviderManager.create()
5. No provider available     → throw Error (if required) or MockLLMProvider
```

### Embedding Resolution Order

For the embedding slot (`resolveEmbedding()`):

```
1. Task-specific mapping     → mappings["embeddings"] → find instance by ID
2. Active embedding instance → ProviderManager.getActive("embedding")
3. GOOGLE_API_KEY env var    → auto-create via ProviderManager.create()
4. No provider available     → throw Error (if required) or MockEmbeddingProvider
```

### Instance → Class Mapping

The `buildLLMProvider()` and `buildEmbeddingProvider()` functions perform the final dispatch:

| `providerName`    | Generative Class     | Embedding Class           |
| ----------------- | -------------------- | ------------------------- |
| `"google-genai"`  | `GeminiProvider`     | `GeminiEmbeddingProvider` |
| `"openai"`        | `OpenAIProvider`     | `OpenAIEmbeddingProvider` |
| `"openrouter"`    | `OpenRouterProvider` | _(falls through to mock)_ |
| `"ollama"`        | `OllamaProvider`     | `OllamaEmbeddingProvider` |
| `"anthropic"`     | `AnthropicProvider`  | _(falls through to mock)_ |
| `"groq"`          | `GroqProvider`       | _(falls through to mock)_ |
| `"deepseek"`      | `DeepSeekProvider`   | _(falls through to mock)_ |
| _(anything else)_ | `MockLLMProvider`    | `MockEmbeddingProvider`   |

## Model Listing and Discovery

The `ModelLister` class provides a unified interface to dynamically query available models from the remote provider APIs.

### Caching and TTL

All list requests are cached in-memory with a **5-minute TTL** (`300,000ms`) to prevent rapid, repetitive remote API requests and avoid rate limit exhaustion.

- **Cache Key**: Generated using `providerName` combined with either the `apiKey` or `endpointUrl`.
- **Invalidation**: Call `ModelLister.invalidateCache(providerName, apiKey, endpointUrl)` to clear cache for specific instances, or `ModelLister.clearCache()` to wipe all lists.

### Provider Integration Details

| Provider          | Endpoint                     | Auth Header             | Pagination                  |
| ----------------- | ---------------------------- | ----------------------- | --------------------------- |
| **Google Gemini** | `GET /v1beta/models?key=KEY` | Query Param             | ✅ Loop via `nextPageToken` |
| **OpenAI**        | `GET /v1/models`             | `Authorization: Bearer` | ❌                          |
| **Anthropic**     | `GET /v1/models`             | `x-api-key`             | ✅ Loop via `after_id`      |
| **Groq**          | `GET /openai/v1/models`      | `Authorization: Bearer` | ❌                          |
| **DeepSeek**      | `GET /models`                | `Authorization: Bearer` | ❌                          |
| **Ollama**        | `GET /api/tags`              | None (Local)            | ❌                          |
| **OpenRouter**    | `GET /api/v1/models`         | Optional Bearer         | ❌                          |
| **Mock**          | Instant return (no fetch)    | —                       | —                           |

### Methods

- `listModels(providerName: string, apiKey: string, endpointUrl?: string): Promise<ModelInfo[]>`
- `invalidateCache(providerName: string, apiKey: string, endpointUrl?: string): void`
- `clearCache(): void`

---

## Structured Output

All real providers use LangChain's `.withStructuredOutput(schema, { includeRaw: true })` pattern:

```typescript
const structuredModel = this.model.withStructuredOutput(request.schema, {
  includeRaw: true,
});
const result = await structuredModel.invoke([
  { role: "system", content: request.systemPrompt },
  { role: "user", content: request.userContext },
]);
```

This sends the Zod schema to the model as a structured output constraint. The response includes both `parsed` (schema-validated data) and `raw` (full API response with usage metadata).

## Configuration

[`config.ts`](src/config.ts) parses environment variables using Zod:

| Variable             | Required | Description              |
| -------------------- | -------- | ------------------------ |
| `GOOGLE_API_KEY`     | No       | Google Gemini API key    |
| `OPENAI_API_KEY`     | No       | OpenAI API key           |
| `OPENROUTER_API_KEY` | No       | OpenRouter API key       |
| `ANTHROPIC_API_KEY`  | No       | Anthropic Claude API key |
| `GROQ_API_KEY`       | No       | Groq API key             |
| `DEEPSEEK_API_KEY`   | No       | DeepSeek API key         |

Env var keys are derived from `PROVIDER_REGISTRY` — each provider's `envVar` field is read by `getLlmConfig()` to build the zod schema lazily. Adding a new provider with `envVar: "NEW_KEY"` automatically adds it to config validation.

## File Map

```
packages/llm/
├── src/
│   ├── index.ts              # Re-exports everything
│   ├── llm.ts                # Interfaces, types, getAvailableProviders()
│   ├── registry.ts           # ProviderRegistry (derived), registerProvider/registerGenerative/registerEmbedding
│   ├── base-provider.ts      # BaseLLMProvider (shared generateStructuredResponse), resolveCredentials
│   ├── config.ts             # Env var parsing (lazy, registry-derived Zod)
│   ├── model-lister.ts       # ModelLister (cache + fetchWithTimeout), fetchOpenAICompatibleModels
│   ├── provider-factory.ts   # buildLLMProvider() / buildEmbeddingProvider() (registry lookup)
│   ├── provider-manager.ts   # ProviderManager (thin CRUD)
│   ├── db.ts                 # Memoized DB handle + migrations
│   ├── row-mapper.ts         # mapRow()
│   ├── bin/
│   │   └── setup-provider.ts # CLI tool to set up provider instances in the database
│   └── providers/
│       ├── google-genai.ts   # GeminiProvider + GeminiEmbeddingProvider (self-registering)
│       ├── ollama.ts         # OllamaProvider + OllamaEmbeddingProvider
│       ├── openrouter.ts     # OpenRouterProvider
│       ├── anthropic.ts      # AnthropicProvider
│       ├── openai.ts         # OpenAIProvider + OpenAIEmbeddingProvider
│       ├── groq.ts           # GroqProvider
│       ├── deepseek.ts       # DeepSeekProvider
│       └── mock.ts           # MockLLMProvider + MockEmbeddingProvider
├── tests/
│   ├── mock.test.ts
│   ├── openrouter.test.ts
│   ├── model-lister.test.ts  # ModelLister cache and fetch logic unit tests
│   ├── provider-manager.test.ts
│   └── cli.test.ts           # Integration tests for setup-provider CLI tool
└── package.json
```
