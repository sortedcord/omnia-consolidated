---
title: LLM Providers & Configuration
description: Details of the LLM provider instances, task routing, and self-bootstrapping setup in Omnia.
sidebar:
  order: 5
---

In Omnia, all non-player character behaviors, action validation, intent decoding, and time step logic are simulated using Large Language Models (LLMs). The LLM subsystem is built around **polymorphism, key instance management, and task provider routing**.

## Core Interfaces

All LLM providers implement the common `ILLMProvider` interface defined in `packages/llm/src/llm.ts`:

```typescript
export interface ILLMProvider {
  providerName: string;
  generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>>;
  lastCalls?: LLMCallRecord[];
}
```

The codebase provides three primary implementations:

1. **`GeminiProvider`:** The production provider utilizing Google's Gemini Models via the `@langchain/google-genai` SDK.
2. **`OpenRouterProvider`:** The production provider utilizing OpenRouter via the `@langchain/openrouter` SDK, allowing routing through various third-party and local models.
3. **`MockLLMProvider`:** A stateless, pre-programmed mock provider used for fast, deterministic unit testing and local integration tests.

---

## LLM Provider Instances

To support multiple different API keys, key rotation, and model variation, Omnia utilizes a **Provider Instance model** rather than relying on static configuration:

```typescript
export interface LLMProviderInstance {
  id: string;
  name: string;
  providerName: string;
  apiKey: string;
  isActive: boolean;
  modelName?: string;
}
```

Users can register multiple provider instances in the **Configuration Page** under the GUI. Each instance is given:

- A friendly, human-readable name (e.g., `"Gemini Production Key"`, `"OpenRouter Claude Key"`).
- A provider type (e.g., `google-genai`, `openrouter`, `mock`).
- An API key credential.
- A custom target model name (e.g., `gemini-2.5-flash`, `anthropic/claude-3-5-sonnet`, or local model paths).
- An **Active** status flag (one key is marked as globally active).

Configurations are stored globally in `data/settings.db` (separated from specific simulation run databases like `data/sim-*.db` to keep key storage and audit logs isolated).

---

## Task Provider Routing

During a simulation run, the engine executes four distinct LLM operations. To optimize costs, latency, or model accuracy, you can route each of these tasks to different LLM provider instances:

| Task Name                  | Key ID           | Description                                                                              | Default Model                                  |
| :------------------------- | :--------------- | :--------------------------------------------------------------------------------------- | :--------------------------------------------- |
| **Actor Prose Generation** | `actor-prose`    | Generates roleplay and narrative behavioral prose for Non-Player Characters.             | `gemini-2.5-flash` / `google/gemini-2.5-flash` |
| **LLM Validator**          | `llm-validator`  | Arbitrates and validates proposed actions against the world state rules and constraints. | `gemini-2.5-flash` / `google/gemini-2.5-flash` |
| **Intent Decoder**         | `intent-decoder` | Parses and splits free-text actions/prose into structured intent sequences.              | `gemini-2.5-flash` / `google/gemini-2.5-flash` |
| **TimeDelta Generator**    | `timedelta`      | Calculates the duration of character actions to advance the game clock.                  | `gemini-2.5-flash` / `google/gemini-2.5-flash` |

If no specific provider instance is mapped to a task, the task automatically routes to the globally marked **Active** provider instance.

---

## Automatic Bootstrapping (Environment Key Fallback)

To maintain backwards-compatibility and support headless runs, live evaluation suites, and automated unit tests without requiring database pre-configuration, the config manager supports **self-bootstrapping**:

1. When any database connection is initialized via the provider manager, if `data/settings.db` contains **0 registered keys**, it checks the process environment for `GOOGLE_API_KEY` and `OPENROUTER_API_KEY`.
2. If `process.env.GOOGLE_API_KEY` is present, it automatically creates, saves, and activates a default provider instance (`Gemini (Env)`) in `settings.db`.
3. If `process.env.OPENROUTER_API_KEY` is present, it automatically creates and saves a default provider instance (`OpenRouter (Env)`) in `settings.db`.
4. If database write locks occur (e.g., during high-concurrency Vitest test suites), the system seamlessly returns a temporary in-memory `LLMProviderInstance` (`Gemini (Env Fallback)` or `OpenRouter (Env Fallback)`) to keep execution fluent and error-free.

---

## Developer Guide: Managing Mappings

Configuration settings are managed through `ProviderManager` static methods:

```typescript
// Query the active provider configuration
const activeConfig = ProviderManager.getActive();

// List all registered provider instances
const allConfigs = ProviderManager.list();

// Retrieve task-specific mappings
const mappings = ProviderManager.getMappings(); // e.g., { "actor-prose": "provider-123" }

// Map a task to a provider instance
ProviderManager.setMapping("actor-prose", "provider-123");
```
