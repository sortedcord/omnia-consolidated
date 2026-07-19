---
title: Architecture Overview
description: High-level architecture of the Omnia engine
---

Omnia is organized as a monorepo with the following subsystems:

```
omnia/
  packages/
    core/        entities, attributes, world state, clock, SQLite persistence
    intent/      intent types (dialogue/action/monologue) and the prose decoder
    architect/   World Architect: LLM validation plus time-delta generation
    actor/       actor agent: epistemically-bounded prompts, pluggable prose generators
    memory/      Cognitive Buffer; Memory Ledger (vector archive), dossier, and affect vectors
    spatial/     location and POI graph, portal-based perception
    llm/         ILLMProvider interface plus Gemini and deterministic mock implementations
    scenario/    scenario JSON schema and loader (JSON → SQLite)
  apps/
    cli/         the playable loop (human or LLM actors, --scenario / --play flags)
  content/
    demo/              bundled scenarios (talking-room)
  tests/
    integration/ cross-package tests against a mocked LLM
    evals/       deliberate real-API evaluation runs
  web/
    landing/     Vite-based landing page
    docs/        Astro-based documentation site
```

The engine core deliberately knows nothing about domain content (stats, traits, genres). Scenarios are plain JSON the loader ingests; what an attribute means is the scenario's business, not the engine's.

## Core Data Flow

1. An **Actor Agent** receives an epistemically-bounded view of the world and produces narrative prose.
2. The **Intent Decoder** splits prose into typed intents (`dialogue`, `action`, `monologue`).
3. The **World Architect** validates action intents against objective world state and generates structured deltas.
4. Deterministic code applies deltas to the **World State** (SQLite) and persists results.
5. Memory entries are written per-character, filtered through **Subjective Aliases**.

## A Research Instrument

Omnia's architecture doubles as an apparatus for studying how language models behave _as characters_ under controlled epistemic conditions. Monologue intents provide a window into private reasoning; attribute ACLs let you administer information with precision; identical initial conditions with swappable model providers enable reproducible experiments.
