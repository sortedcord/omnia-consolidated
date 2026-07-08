![Omnia Logo](web/docs/src/assets/img/logo.png)

An LLM-assisted narrative simulation engine where the <b>world state lives outside the model</b>, characters act through <b>intents that get validated</b> and applied by engine code, and each character's knowledge, memory, and emotional state are subjective and partial by construction.

Omnia is an engine for building narrative RPG-style worlds where characters are played by a language model. It is built to survive long play sessions instead of falling apart after twenty minutes.

## The Problem with the Naive Approach

Single-agent, single-context systems (AI Dungeon and its descendants) prompt one model to _be_ the world and everyone in it. That breaks in predictable ways over long sessions:

- **State Leaks:** Characters know things they had no way of learning, because a model with full context cannot help but use it. The assassin's target greets him by name.
- **Secrets Refuse to Stay Secret:** "Don't reveal this" is a suggestion a model can argue past, not a mechanism that says no. One clever player question and the conspiracy folds.
- **Consequences Evaporate:** Betray someone, apologize, and they forgive you a turn later because nothing is tracking the betrayal as a persistent fact.
- **Emotional Drift:** Emotional state is either frozen into a meaningless number (`trust: 40`) or handed to the model to grade itself, producing drifting, arbitrary values.
- **World Rot:** The world state slowly contradicts itself because the model has no structured place to keep it. The locked door is open, then locked, then never existed.
- **Everyone Is One Person:** Every character shares one context, so every character shares one mind. They can't genuinely surprise each other, lie to each other, or know different things — they're sock puppets on the same hand.

The root cause is the same in every case: the model is being asked to be the database, the physics engine, the referee, and the whole cast simultaneously — inside a context window that forgets, blends, and leaks.

## The Omnia Solution

Omnia answers every one of these failures with the same move: pull the thing that has to stay consistent out of the model and into structured, queryable, code-controlled state.

- **World State:** Lives in a SQLite database, not in a context window. It cannot drift, because nothing regenerates it — it only changes through validated deltas.
- **Actions:** Actions are proposals (Intents) that engine code validates and applies; they are never direct edits the model makes to the world. The model proposes; deterministic code disposes.
- **Epistemic Privacy:** Knowledge, memory, and emotion are modeled per character and kept partial on purpose. A character literally cannot reach for what it has not earned the right to know — the secret is not in its prompt, so there is nothing to jailbreak out of it.

## What This Buys You

The payoff is scenario complexity that uni-agent systems structurally cannot represent, no matter how good the model gets:

- **Real secrets, real dramatic irony.** One NPC knows the sword is cursed; the other does not. This holds for hundreds of turns not because the model is disciplined, but because the second NPC's prompts are constructed from an attribute set that simply does not contain the fact. Leaking it would require the engine to have handed it over.
- **Genuine deception between characters.** Because each character acts from its own bounded view, characters can lie to each other — and be believed — with the truth intact in the world state. A con game, a mole in the party, an unreliable ally: these are queries over who-knows-what, not prompt acrobatics.
- **Betrayal that stays betrayed.** Events persist as per-observer memory entries with outcomes. An apology adds a memory; it does not delete one.
- **Divergent accounts of the same event.** Two witnesses to the same scene hold two different buffer entries, filtered through their own aliases and vantage points. Ask them separately what happened and you get testimony, not a transcript.
- **Identity as information.** Characters refer to each other through subjective alias maps ("the hooded figure" vs. "Bob"). Recognizing someone, being recognized, or staying anonymous are all mechanical states — a masked stranger is a masked stranger until the engine says otherwise.
- **A physics referee that can say no.** "I pick the lock with a hairpin" is validated against world state by the Architect before anything changes. Failure is a recorded outcome the character remembers, not a narrative the model politely retconned.
- **Time that behaves.** A world clock advances by validated, per-action deltas, and memory is recalled with psychologically natural phrasing ("earlier today, in the afternoon" — not a timestamp). Long timelines stay coherent because time is data, not vibes.

The general principle: **anything that must remain true is state; the model only ever supplies behavior.** That division of labor is what lets the cast, the secrets, and the timeline scale without the fiction collapsing.

## Core Architecture

### The Actor Agent

Each character takes turns through an **Actor Agent** that receives a strictly epistemically-bounded prompt: its own attributes (public, plus private ones explicitly granted to itself), its subjective memory buffer, the entities co-present at its location, and the current moment. Nothing else. The actor responds with free narrative prose — what the character does, says, or _thinks_.

Prose is decoded into typed intents:

- **`dialogue`** — speech others can hear.
- **`action`** — a physical act, subject to validation.
- **`monologue`** — an inner thought. No one else perceives it, it bypasses validation entirely, and it is written straight into the character's private memory.

Not every turn needs an outward act; a character may simply think. This is what makes characters feel inhabited rather than reactive — and it produces a durable, queryable record of each character's private reasoning (see [Research Instrument](#a-research-instrument-model-psychology-in-fiction) below).

The prose generator is pluggable (`IActorProseGenerator`): the same turn loop runs an LLM-driven NPC or a human at a CLI prompt, identically bounded by what their character knows.

### Intents & The World Architect

An action becomes an **Intent** — a cheap, declarative, allowed-to-be-wrong proposal. Intents route to the **World Architect**, which validates them against the objective world state (dialogue is exempt; monologue never even arrives) and generates structured deltas — starting with time advancement — that deterministic code applies after strict schema (Zod) validation. The model proposes a change; it never touches the database.

This is the load-bearing wall. Because every mutation flows through one validated chokepoint, the world cannot rot: there is no second copy of reality inside a context window to fall out of sync.

### Attribute-Level Privacy

Every entity, item, and location is an attribute bag. Each attribute carries its own visibility (`PUBLIC` or `PRIVATE`) with an explicit access list. "The sword is cursed" is a private attribute checked in code, not a rule the model is politely asked to honor. Privacy lives at the level of the fact, not the entity — a character can be publicly a blacksmith and privately a spy, and even facts about _itself_ are hidden from it unless explicitly granted (amnesia, repression, and unwitting sleeper agents come free with the model).

The dividend: **prompt-injection-proof secrets.** There is no instruction to override because the information was never serialized into the prompt. Epistemic privacy turns "the model shouldn't say this" (hard, unreliable) into "the model doesn't know this" (trivial, absolute).

### Spatial Perception

Space is a graph: `world → region → location → point of interest`, connected by portals with sound and vision propagation values. When something happens, it bubbles outward. There are no coordinates, no pathfinding, no collision geometry — a narrative engine doesn't need a tactical simulation, and a discrete graph is sufficient. Today actors perceive co-located entities and their location's visible attributes; portal-propagated perception is on the roadmap.

### Memory Tiers

- **Verbatim Buffer (implemented):** Per-character subjective event log. Every entry is stored from the owner's perspective — actors resolved through the owner's alias map, outcomes attached — and recalled with naturalized time phrasing.
- **Vector Archive (planned):** Summarized, embedded memory entries for semantic retrieval, keeping verbatim quotes only for high-salience lines.
- **Dossier (planned):** Each observer's subjective beliefs about another character.

Memory is per-character on purpose: recall is testimony from a vantage point, which is what makes interrogating two witnesses interesting.

### Emotional State ([NLAVS](https://github.com/sortedcord/NLAVS))

Rather than a scalar the model drifts, every significant interaction becomes a ledger entry with an affect vector across OCC-derived dimensions (plus arousal, dominance, and social drive). The model judges a single moment; deterministic code aggregates the ledger over time with decay and attention weighting. A character can be simultaneously furious about one thing and grateful for another, and an apology does not silently erase a betrayal.

## A Research Instrument: Model Psychology in Fiction

Omnia's architecture doubles as an apparatus for studying how language models behave _as characters_ under controlled epistemic conditions — something uni-agent setups cannot do, because they can neither control what the model knows nor observe what it withholds.

- **A window into private reasoning.** Monologue intents are the model's in-character thoughts: unperceived by other agents, exempt from validation, but durably logged. You can directly compare what a character _thinks_ against what it _says and does_ — measuring deception, self-consistency, motivated reasoning, or the gap between private appraisal and public behavior.
- **Knowledge as an experimental variable.** Attribute ACLs let you administer information with precision: give one agent a fact, withhold it from another, and observe propagation, inference, and leakage through dialogue alone. Secret-keeping stops being anecdotal and becomes testable — _provably_, since the engine logs exactly what each agent was ever shown.
- **Controlled, reproducible conditions.** A scenario is a JSON file; a run is a SQLite database. Identical initial conditions, swappable model providers behind one interface (`ILLMProvider`), and a deterministic mock for baselines. Rerun the white-room experiment a hundred times, vary one attribute, and diff the transcripts.
- **Multi-agent social dynamics with ground truth.** Because objective world state exists independently of any agent's beliefs, you can score agents' beliefs and claims against reality — hallucination, confabulation, and social conformity become measurable quantities rather than impressions.

The bundled demo scenario is exactly this: [`talking-room`](./content/demo/scenarios/talking-room.json) places two memory-wiped subjects in a featureless white room — each knowing their own name but not the other's — and observes what they do. It runs today, via the CLI, with a human optionally playing either subject.

## Project Status: What `v0` Means

The finish line for the first milestone is small on purpose.

**Currently Implemented:**

- [x] Attribute and ACL model (with some enforcement gaps open).
- [x] Typed intent pipeline: `dialogue` / `action` / `monologue`, decoded from free prose.
- [x] World Architect: LLM validation plus time-delta generation, end-to-end for single actions.
- [x] Actor Agent with epistemically-bounded prompts (self, memory, co-located entities, subjective time).
- [x] Verbatim memory buffer with per-observer subjective serialization and alias resolution.
- [x] Spatial location graph (data model; perception is co-location only).
- [x] Scenario loader (JSON → SQLite) and a playable CLI loop with human or LLM actors.

**[The `v0` Milestone:](https://github.com/sortedcord/omnia-consolidated/milestone/1)**

- [x] Two hand-authored NPCs live in one location, playable via CLI.
- [ ] Each has buffer and vector-archive memory and recalls something said a few turns earlier. _(buffer: done; vector archive: not started)_
- [ ] One NPC knows a fact the other does not and, provably by testing, will not leak it.
- [x] The Architect processes at least one non-trivial action per exchange with a visible state change.
- [x] The whole thing persists to a SQLite file and reloads identically.

**Explicitly out of scope for `v0`:** Constraint validators (beyond basic sense-checking), multi-location perception, affect-vector decay math, the Dossier, whims/simulation tiering, the delta ledger, and UI beyond CLI.

### A Note on Tech Debt

The Architect currently trusts an LLM's judgement about reasonable consequences rather than validating every change against declarative constraints. A general constraint solver is worth building eventually, but building it before anything is playable is foundational perfectionism that produces beautiful architecture and no game. `v0` keeps the single-call Architect on purpose.

## Repository Layout

The project is one repository because the subsystems share a single evolving schema. Splitting before that schema stabilizes just means types drift apart.

```text
omnia/
  packages/
    core/        entities, attributes, world state, clock, SQLite persistence
    intent/      intent types (dialogue/action/monologue) and the prose decoder
    architect/   World Architect: LLM validation plus time-delta generation
    actor/       actor agent: epistemically-bounded prompts, pluggable prose generators
    memory/      verbatim buffer; later the vector archive, dossier, and affect vectors
    spatial/     location and POI graph, portal-based perception
    llm/         ILLMProvider interface plus Gemini and deterministic mock implementations
  content/
    scenario-core/     scenario JSON schema and loader (JSON → SQLite)
    scenario-builder/  Next.js web UI for authoring worlds
    demo/              bundled scenarios (talking-room)
  cli/           the playable loop (human or LLM actors, --scenario / --play flags)
  tests/
    integration/ cross-package tests against a mocked LLM
    evals/       deliberate real-API evaluation runs
  docs/          Astro documentation site (→ web/docs/)
```

_The engine core deliberately knows nothing about domain content (stats, traits, genres). Scenarios are plain JSON the loader ingests; what an attribute means is the scenario's business, not the engine's._

## Roadmap (Build Order after `v0`)

1. Vector-archive memory and retrieval (closing out the `v0` memory milestone).
2. Constraint validators for specific cases actually hit while testing.
3. Multi-location, portal-propagated perception.
4. Memory decay scoring.
5. The Dossier, affect vectors, and identity resolution (sharing time-weighting logic).
6. The delta ledger and undo.
7. Autonomy (once there are enough NPCs for idle simulation to matter).

_Each step will be genuinely working and in use before the next one starts._

## Origin

This repository is a consolidation, not a fresh start. It reconciles four earlier prototypes and months long research experiments into a single monorepo

- [`omnia` (Python)](https://github.com/sortedcord/omnia): The original manifesto. World-state-outside-the-model, patch merging, tick engine. Scaffolding dropped, ideas kept.
- [`omnia-faiss`](https://github.com/sortedcord/omnia-faiss): The first thing that genuinely ran end-to-end. Stands as the reference implementation for behavior.
- [`pure-ts`](https://github.com/sortedcord/pure-ts): Contributed the attribute-level visibility model and typed intent pipeline the current core is built on.
- [`NLAVS`](https://github.com/sortedcord/NLAVS): Solved the math for emotional state properly. Folds in as the eventual Dossier implementation.
