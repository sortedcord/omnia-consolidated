---
title: Introduction
description: What is Omnia and why it exists
---

![Omnia Logo](../../assets/img/logo.png)

An LLM-assisted narrative simulation engine where the **world state lives outside the model**, characters act through **intents that get validated** and applied by engine code, and each character's knowledge, memory, and emotional state are subjective and partial by construction.

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

- **Real secrets, real dramatic irony.** One NPC knows the sword is cursed; the other does not. This holds for hundreds of turns not because the model is disciplined, but because the second NPC's prompts are constructed from an attribute set that simply does not contain the fact.
- **Genuine deception between characters.** Because each character acts from its own bounded view, characters can lie to each other — and be believed — with the truth intact in the world state.
- **Betrayal that stays betrayed.** Events persist as per-observer memory entries with outcomes. An apology adds a memory; it does not delete one.
- **Divergent accounts of the same event.** Two witnesses to the same scene hold two different buffer entries, filtered through their own aliases and vantage points.
- **Identity as information.** Characters refer to each other through subjective alias maps. Recognizing someone, being recognized, or staying anonymous are all mechanical states.
- **A physics referee that can say no.** "I pick the lock with a hairpin" is validated against world state by the Architect before anything changes.
- **Time that behaves.** A world clock advances by validated, per-action deltas, and memory is recalled with psychologically natural phrasing.

The general principle: **anything that must remain true is state; the model only ever supplies behavior.**
