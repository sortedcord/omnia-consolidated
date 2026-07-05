# Omnia

An LLM-assisted narrative simulation engine where the <b>world state lives outside the model</b>, characters act through <b>intents that get validated</b> and applied by engine code, and each character's knowledge, memory, and emotional state are subjective and partial by construction.

Omnia is an engine for building narrative RPG-style worlds where characters are played by a language model. It is built to survive long play sessions instead of falling apart after twenty minutes. 

## The Problem with the Naive Approach

Prompting a model to just *be* the world or *be* an NPC breaks in predictable ways over long sessions:

*   **State Leaks:** Characters know things they had no way of learning because a model with full context cannot help but use it.
*   **Secrets Refuse to Stay Secret:** "Don't reveal this" is a suggestion a model can argue past, not a mechanism that says no.
*   **Consequences Evaporate:** Betray someone, apologize, and they forgive you a turn later because nothing is tracking the betrayal as a persistent fact.
*   **Emotional Drift:** Emotional state is either frozen into a meaningless number (`trust: 40`) or handed to the model to grade itself, producing drifting, arbitrary values.
*   **World Rot:** The world state slowly contradicts itself because the model has no structured place to keep it.

## The Omnia Solution

Omnia answers every one of these failures with the same move: pull the thing that has to stay consistent out of the model and into structured, queryable, code-controlled state. 

*   **World State:** Lives in a database, not in a context window.
*   **Actions:** Actions are proposals (Intents) that engine code validates and applies; they are never direct edits the model makes to the world.
*   **Epistemic Privacy:** Knowledge, memory, and emotion are modeled per character and kept partial on purpose. A character literally cannot reach for what it has not earned the right to know.

## Core Architecture

### Intents & The World Architect
An action becomes an **Intent**—a cheap, declarative, allowed-to-be-wrong proposal. Intents pass through a pipeline of validators (plain functions that reject or reshape proposals against current world state) and resolve. Simple speech resolves directly. Complex actions route to the **World Architect**, a single LLM call that receives scoped world state and returns a structured JSON delta. That delta is applied to the world by deterministic code after strict schema validation. The model proposes a change; it never touches the database.

### Attribute-Level Privacy
Every entity, item, and location is an attribute bag. Each attribute carries its own visibility (`PUBLIC` or `PRIVATE`) with an access list. "The sword is cursed" is a private attribute checked in code, not a rule the model is politely asked to honor. Privacy lives at the level of the fact, not the entity.

### Spatial Perception
Space is a graph: `world → region → location → point of interest`, connected by portals with sound and vision propagation values. When something happens, it bubbles outward. There are no coordinates, no pathfinding, no collision geometry—a narrative engine doesn't need a tactical simulation, and a discrete graph is sufficient.

### Memory Tiers
*   **Verbatim Buffer:** Holds the last few turns of working memory.
*   **Vector Archive:** Stores summarized, embedded memory entries for semantic retrieval, keeping verbatim quotes only for high-salience lines.
*   **Dossier (Planned):** Will hold each observer's subjective beliefs about another character.

### Emotional State ([NLAVS](https://github.com/sortedcord/NLAVS))
Rather than a scalar the model drifts, every significant interaction becomes a ledger entry with an affect vector across OCC-derived dimensions (plus arousal, dominance, and social drive). The model judges a single moment; deterministic code aggregates the ledger over time with decay and attention weighting. A character can be simultaneously furious about one thing and grateful for another, and an apology does not silently erase a betrayal.

## Project Status: What `v0` Means

The finish line for the first milestone is small on purpose. 

**Currently Implemented:**
- [x]   Attribute and ACL model (with some enforcement gaps open).
- [x]   World Architect working end-to-end for single actions.
- [x]  Verbatim buffer and vector archive.
- [x]   Spatial perception graph.

**[The `v0` Milestone:](https://github.com/sortedcord/omnia-consolidated/milestone/1)**
- [ ]   Two hand-authored NPCs live in one location, playable via CLI.
- [ ]   Each has buffer and vector-archive memory and recalls something said a few turns earlier.
- [ ]   One NPC knows a fact the other does not and, provably by testing, will not leak it.
- [ ]   The Architect processes at least one non-trivial action per exchange with a visible state change.
- [ ]   The whole thing persists to a SQLite file and reloads identically.

**Explicitly out of scope for `v0`:** Constraint validators (beyond basic sense-checking), multi-location perception, affect-vector decay math, the Dossier, whims/simulation tiering, the delta ledger, and UI beyond CLI. 

### A Note on Tech Debt
The Architect currently trusts an LLM's judgement about reasonable consequences rather than validating every change against declarative constraints. A general constraint solver is worth building eventually, but building it before anything is playable is foundational perfectionism that produces beautiful architecture and no game. `v0` keeps the single-call Architect on purpose.

## Repository Layout

The project is one repository because the subsystems share a single evolving schema. Splitting before that schema stabilizes just means types drift apart.

```text
omnia/
  packages/
    core/        entities, attributes, world state, SQLite persistence
    intent/      intent pipeline: types, validators, consequence application
    architect/   World Architect: LLM delta generation plus Zod validation
    memory/      buffer, vector archive, later the dossier and affect vectors
    spatial/     location and POI graph, portal-based perception
    llm/         ILLMProvider interface plus a Gemini implementation
  content/       scenario JSON files, produced by the Python scenario builder
  cli/           the playable loop
  docs/
    spec.md      the living source of truth
    IDEAS.md     everything deliberately deferred
    BUILD_LOG.md one dated line per session
```
*Note: Content tooling stays in Python indefinitely. It emits JSON the engine reads, so it doesn't need to share a language with the core. Domain-specific content (stats, traits) lives here, as the engine core deliberately knows nothing about them.*

## Roadmap (Build Order after `v0`)

1. Constraint validators for specific cases actually hit while testing.
2. Multi-location perception.
3. Memory decay scoring.
4. The Dossier, affect vectors, and identity resolution (sharing time-weighting logic).
5. The delta ledger and undo.
6. Autonomy (once there are enough NPCs for idle simulation to matter).

*Each step will be genuinely working and in use before the next one starts.*

## Origin

This repository is a consolidation, not a fresh start. It reconciles four earlier prototypes and months long research experiments into a single monorepo

*   [`omnia` (Python)](https://github.com/sortedcord/omnia): The original manifesto. World-state-outside-the-model, patch merging, tick engine. Scaffolding dropped, ideas kept.
*   [`omnia-faiss`](https://github.com/sortedcord/omnia-faiss): The first thing that genuinely ran end-to-end. Stands as the reference implementation for behavior.
*   [`pure-ts`](https://github.com/sortedcord/pure-ts): Contributed the attribute-level visibility model and typed intent pipeline the current core is built on.
*   [`NLAVS`](https://github.com/sortedcord/NLAVS): Solved the math for emotional state properly. Folds in as the eventual Dossier implementation.
