<p align="center">
<img src="web/docs/src/assets/img/logo.png" alt="Omnia Logo" />
</p>

<h1 align="center">Omnia</h1>

<p align="center">
<b>An architectural framework for multi agent-narrative simulations and fictional worlds!</b>
</p>
<p align="center">
  <a href="https://omnia.adityagupta.dev/docs"><img src="https://img.shields.io/badge/Omnia_Docs-Read_The_Docs-red?style=for-the-badge" alt="Docs" /></a>
  <img src="https://img.shields.io/github/license/sortedcord/omnia-consolidated?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/github/repo-size/sortedcord/omnia-consolidated?style=for-the-badge" alt="Repo Size" />
  <img src="https://img.shields.io/github/languages/top/sortedcord/omnia-consolidated?style=for-the-badge" alt="Top Language" />
</p>

The <b>world state lives outside the model</b>, characters act through <b>intents that get validated</b> and applied by engine code. Each character's knowledge, memory, and emotional state are subjective and partial by construction.

<p align="center">
  <img src="./web/docs/src/assets/img/puppet.webp" alt="This pixel-art style image, set against a black background with the title 'The Puppet Master Paradox' at the top, depicts two identical, stylized puppets with white, round heads and orange patterned bodies facing each other. Between them hovers a small, glowing, four-pointed star, while each puppet has an orange-outlined speech bubble above it: the left one states, 'Good evening. Welcome to my humble bakery!', and the right one replies, 'Nice to meet you Assassin Bob. Wait... wha-', concluding with a small white 'X' icon in the bottom right corner." />
</p>

Single-agent or single-context systems (AI Dungeon and its descendants) prompt one model to _be_ the world and everyone in it. That breaks in predictable ways over long sessions:

- **State Leaks:** Characters know things they had no way of learning, because a model with full context cannot help but use it.
- **Consequences Evaporate:** Betray someone, apologize, and they forgive you a turn later because nothing is tracking the betrayal as a persistent fact.
- **Stat Drift:** Statistical attributes are either frozen into a meaningless number (`trust: 40`) or handed to the model to grade itself, producing drifting, arbitrary values.
- **World Rot:** The world state slowly contradicts itself because the model has no structured place to keep it. The locked door is open, then locked, then never existed.
- **Everyone Is One Person:** Every character shares one context, so every character shares one mind. They can't genuinely surprise each other, lie to each other, or know different things. They're sock puppets on the hands of one puppetmaster.

The model should not be the database, the physics engine and the whole cast simultaneously inside a sliding context window.

## The Omnia Solution

Omnia answers every one of these failures with the same move: **pull the thing that has to stay consistent out of the model** and into structured, queryable, code-controlled state.

- **World State:** Lives in a DB, not a context window. It cannot drift, because nothing regenerates it. The world state only changes through validated deltas.
- **Actions:** Actions are proposals (Intents) that engine code validates and applies; they are never direct edits the model makes to the world. The model proposes; deterministic code disposes.
- **Epistemic Privacy:** Knowledge, memory, and emotion are modeled per character and kept partial on purpose. A character literally cannot reach for what it has not earned the right to know. The secret is not in its prompt, so there is **nothing to jailbreak out of it**.

## What this buys you

<p align="center">
  <img src="./web/docs/src/assets/img/features.webp" alt="This pixel-art image features a grid of six distinct panels, each with an orange-outlined, jagged border, illustrating different concepts: 'Emergent Deceit' shows a person hiding a sword behind their back while offering a rose to another person; 'Divergent Perceptions' depicts two figures sitting at a table with speech bubbles labeled 'A' and 'B'; 'Player Agnostic' shows three figures engaged in different activities—watering a plant, standing still, and juggling—under the plumbob symbol from the sims; 'State Validated Agency' displays a stylized symbol of a person partially inside a portal crossed out by a large red 'X'; 'Deterministic Time' shows four circular panels representing a day-night cycle connected by arrows and clock icons; and 'Bring Your Own Model' features a large, central omnia icon surrounded by various LLM model logos including chatgpt, mistral, deepseek, claude, etc****" />
</p>

The payoff is scenario complexity that **uni-agent systems structurally cannot represent, no matter how good the model gets**.

- **Real secrets, real dramatic irony.** One NPC knows the sword is cursed; the other does not. This holds for hundreds of turns not because the model is disciplined, but because the second NPC's prompts are constructed from an attribute set that simply does not contain the fact. Leaking it would require the engine to have handed it over.
- **Genuine deception between characters.** Because each entity acts from its own bounded view, they can lie to each other and be believed; with the truth intact in the world state. A con game, a mole in the party, an unreliable ally: these are queries over "who knows what" and not prompt engineering.
- Events persist as per observer memory entries with outcomes. An apology adds a memory; it does not delete one.
- **Divergent accounts of the same event.** Two witnesses to the same scene hold two different buffer entries, filtered through their own aliases and vantage points. Ask them separately what happened and you get varied testimony.
- **A physics referee that can say no.** `I pick the lock with a hairpin` is validated against world state by the Architect before anything changes. Failure is a recorded outcome the entity remembers.
- **Time that behaves.** A world clock advances by validated, per-action deltas, and memory is recalled with psychologically natural phrasing ("earlier today, in the afternoon" — not a timestamp). `TimeOfDay` is deterministic and not based on vibes.
- **No main character syndrome.** The simulation runs fully autonomously or you act on behalf of any entity. You, the player, are just an entity in the data model, not structurally elevated above the rest of the world. The world can exist without the you.
- **Granular model control.** Omnia is not locked to a single LLM. You can pick a different model for **every individual step that calls the LLM**. Narration prose that demands richer reasoning gets a frontier model; quick intent decoding or other generators get smaller ones or a model running entirely on your local machine.

The general principle: **anything that must remain true is state; the model only ever supplies behavior.**

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/) (v9+ recommended)
- An API key for Google Gemini (`GOOGLE_API_KEY` environment variable), or configured settings via the GUI.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sortedcord/omnia-consolidated.git
   cd omnia-consolidated
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```

### Running the Web GUI

To launch the Next.js development server for the GUI dashboard:

```bash
pnpm dev:gui
```

Access the application locally at `http://localhost:3000`.

## Core Architecture

### The Actor Agent

Each entity takes turns through an **Actor Agent** that receives a strictly epistemically bounded prompt: its own attributes (public, plus private ones explicitly granted to itself), its **Cognitive Buffer**, the entities co-present at its location, and the current moment. Nothing else. The actor responds with free narrative prose.

Prose is decoded into typed intents:

- **`dialogue`** — speech others can hear.
- **`action`** — a physical act, subject to validation.
- **`monologue`** — an inner thought. No one else perceives it, it bypasses validation entirely, and it is written straight into the character's private memory.

Not every turn needs an outward act; a character may simply think. This is what makes characters feel inhabited rather than reactive and it produces a queryable record of each character's private reasoning (see [Research Instrument](#a-research-instrument-model-psychology-in-fiction) below).

The prose generator is pluggable (`IActorProseGenerator`): the same turn loop runs an LLM driven NPC or a human, identically bounded by what their character knows. (This is what eliminates Main Character Syndrome)

### Intents & The World Architect

An action becomes an **Intent** which is a simple proposal that is _allowed to be wrong_. Intents route to the **World Architect**, which validates them against the objective world state and generates structured deltas like time advancement, attribute change, etc. This deterministic code applies after strict schema (Zod) validation. The model never touches the DB.

Because every mutation flows through one validated chokepoint, the world cannot rot: there is no second copy of reality inside a context window to fall out of sync.

### Attribute Level Privacy

Every entity, item, and location is an _attribute bag_. Each attribute carries its own visibility (`PUBLIC` or `PRIVATE`) with an explicit access list. "The sword is cursed" is a private attribute checked in code, not a rule the model is politely asked to honor. Privacy lives at the level of the fact, not the entity. A character can be publicly a blacksmith and privately a spy, and even facts about _itself_ are hidden from it unless explicitly granted (amnesia, repression, and unwitting sleeper agents come free with the model).

The dividend: **prompt-injection-proof secrets.** There is no instruction to override because the information was never serialized into the prompt. Epistemic privacy turns "the model shouldn't say this" (hard, unreliable) into "the model doesn't know this" (trivial, absolute).

### Spatial Perception

Space is a graph: `world → region → location → point of interest`, connected by portals with sound and vision propagation values. When something happens, it bubbles outward. There are no coordinates, no pathfinding, no collision geometry — a narrative engine doesn't need a tactical simulation, and a discrete graph is sufficient. Today actors perceive co-located entities and their location's visible attributes; portal propagated perception is on the roadmap.

### Memory Tiers

- **Cognitive Buffer (implemented):** Per-character subjective event log. Every entry is stored from the owner's perspective actors resolved through the owner's alias map, outcomes attached — and recalled with naturalized time phrasing.
- **Memory Ledger (implemented):** Summarized, embedded memory entries for semantic retrieval, keeping verbatim quotes only for high-salience lines.
- **Dossier (planned):** Each observer's subjective beliefs about another character.

Memory is per-character on purpose: recall is testimony from a vantage point, which is what makes interrogating two witnesses interesting.

### Emotional State ([NLAVS](https://github.com/sortedcord/NLAVS))

Rather than a scalar the model drifts, every significant interaction becomes a ledger entry with an affect vector across OCC-derived dimensions (plus arousal, dominance, and social drive). The model judges a single moment; deterministic code aggregates the ledger over time with decay and attention weighting. A character can be simultaneously furious about one thing and grateful for another, and an apology does not silently erase a betrayal.

This however is something that I haven't implementing or plan to implement anytime soon. The mathematical models described in NLAVS is still very abstract and subject to a lot of changes. CAA and RepE is still cutting edge research that I'm still reading papers about.

Omnia might get an affect vector system however, it's going to be more simplistic than what the NLAVS proposal scribbles down.

## A Research Instrument: Model Psychology in Fiction

Omnia's architecture doubles as an apparatus for studying how language models behave _as characters_ under controlled epistemic conditions.

- **A window into private reasoning.** Monologue intents are the model's in character thoughts: unperceived by other agents, exempt from validation, but durably logged. You can directly compare what a character _thinks_ against what it _says and does_: measuring deception, self-consistency, motivated reasoning, etc.
- **Knowledge as an experimental variable.** Attribute ACLs let you administer information with precision: give one agent a fact, withhold it from another, and observe propagation, inference, and leakage through dialogue alone.
- **Controlled, reproducible conditions.** A scenario is a JSON file (like a template); a run is a SQLite database. Identical initial conditions, swappable model providers behind one interface (`ILLMProvider`), and a deterministic mock for baselines. Rerun the scenario a hundred times, vary one attribute, and diff the transcripts.
- **Multi agent social dynamics with ground truth.** Because objective world state exists independently of any agent's beliefs, you can score agents' beliefs and claims against reality like hallucination. Even social conformity become measurable quantities rather than impressions or _✨ vibes_.

The bundled demo scenario is exactly this: [`talking-room`](./content/demo/scenarios/talking-room.json) places two memory wiped subjects in a featureless white room. Each know their own name but not the other's. Observe what they do. It runs today, ~~via the CLI, with a human optionally playing either subject~~ via a GUI which is in rapid development. You can let it run forever autonomously or roleplay as either character.

## Project Status: What `v0` Means

The finish line for the first milestone is small on purpose. `v0` is almost on the horizon. All assigned systems for `v0` have been implemented and tested throughout.

**Currently Implemented:**

- [x] Attribute and ACL model (with some enforcement gaps open).
- [x] Typed intent pipeline: `dialogue` / `action` / `monologue`, decoded from free prose.
- [x] World Architect: LLM validation plus time-delta generation, end-to-end for single actions.
- [x] Actor Agent with epistemically-bounded prompts (self, memory, co-located entities, subjective time).
- [x] Verbatim Cognitive Buffer with per-observer subjective serialization and alias resolution.
- [x] Spatial location graph (data model; perception is co-location only).
- [x] Scenario loader (JSON → SQLite) and a playable CLI loop with human or LLM actors.

**[The `v0` Milestone:](https://github.com/sortedcord/omnia-consolidated/milestone/1)**

- [x] Two hand-authored NPCs live in one location, playable via CLI.
- [x] Each has Cognitive Buffer and Memory Ledger memory and recalls something said a few turns earlier.
- [x] One NPC knows a fact the other does not and, provably by testing, will not leak it.
- [x] The Architect processes at least one non-trivial action per exchange with a visible state change.
- [x] The whole thing persists to a SQLite file and reloads identically.

### A Note on Tech Debt

The Architect currently trusts an LLM's judgement about reasonable consequences rather than validating every change against declarative constraints. A general constraint solver is worth building eventually, but building it before anything is playable is foundational perfectionism that produces beautiful architecture and no framework. `v0` keeps the single-call Architect on purpose.

## Repository Layout

The project is one repository because the subsystems share a single evolving schema. Splitting before that schema stabilizes just means types drift apart.

```text
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
    gui/         Next.js Web GUI dashboard and simulation runner
  content/
    demo/              bundled scenarios (talking-room)
  tests/
    integration/ cross-package tests against a mocked LLM
    evals/       deliberate real-API evaluation runs
  web/
    docs/        Astro documentation site
```

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
