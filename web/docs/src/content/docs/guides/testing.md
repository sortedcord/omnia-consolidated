---
title: Testing Strategy
description: Three-tiered testing architecture for deterministic and non-deterministic code
---

The central testing challenge: most of Omnia is deterministic and highly testable, but a few critical parts (LLM behavior) are non-deterministic. Treating both categories the same way — either mocking everything or hitting the real LLM API — is an anti-pattern.

## Test Tiers

### Tier 1: Unit Tests (Per-Package, No LLM)

Unit tests reside within each package's `tests/` directory. They do not use LLMs and do not perform I/O. This tier covers the majority of the codebase.

Examples:

- `hasAccess()` / ACL grant-revoke logic
- `addAttribute` rejecting duplicate names
- `WorldClock.advance()` / `getTimeOfDay()` boundaries
- The spatial bubble-up algorithm
- Zod schemas rejecting malformed input

**Execution:** Runs on every save and every commit.

### Tier 2: Integration Tests (Cross-Package, Mocked LLM)

Integration tests live in the root `tests/integration/` directory. They test cross-package flows using `MockLLMProvider` for speed and determinism.

```typescript
export class MockLLMProvider implements ILLMProvider {
  providerName = "mock";
  constructor(private responses: unknown[]) {}
  private callCount = 0;

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const next = this.responses[this.callCount++];
    return { success: true, data: request.schema.parse(next) };
  }
}
```

A shared contract test suite runs against both `MockLLMProvider` and `GeminiProvider` to enforce real interchangeability.

### Tier 3: Evals (Real API, Run Deliberately)

Evals live in `tests/evals/`. They use real LLM APIs and are run manually via `test:evals`, excluded from the default Vitest run.

This tier tests privacy guarantees that unit tests cannot verify:

```typescript
// tests/evals/privacy-leak.eval.ts
const RUNS = 15;
let leaks = 0;

for (let i = 0; i < RUNS; i++) {
  const response = await askAboutPrivateFact(npcWithoutAccess, secretFact);
  if (containsFact(response, secretFact)) leaks++;
}

expect(leaks).toBe(0);
```

**Execution:** Run deliberately (e.g., weekly or pre-release).

## Directory Structure

```
omnia/
  packages/
    core/       src/  tests/        # Tier 1: Unit — no I/O, no LLM
    intent/     src/  tests/
    spatial/    src/  tests/
    memory/     src/  tests/
    architect/  src/  tests/
    llm/        src/  tests/        # Includes MockLLMProvider + shared contract suite
  tests/
    integration/                    # Tier 2: Cross-package flows, mocked LLM
    evals/                         # Tier 3: Real LLM calls, slow/costly/non-deterministic
```
