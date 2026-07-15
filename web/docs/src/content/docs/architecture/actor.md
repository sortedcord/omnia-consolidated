---
title: Actor Agent
description: The component that embodies a single entity and produces narrative prose
---

The Actor Agent is the system component that embodies a single entity and produces narrative prose describing what that entity does, says, or thinks next. It is the "inner voice" of an NPC (or player character), generating behavior proposals that are then validated and executed by the rest of the engine.

## Design Principles

1. **Epistemic boundedness** — The actor only sees what its entity would perceive: public attributes of other entities, private attributes explicitly ACL'd to it, its own memory buffer, and co-located entities. It does not have system-level access to all world state.

2. **Proposal, not mutation** — The actor generates a _proposal_ (narrative prose). It never mutates world state, persists to the database, or writes to memory directly. Validation, execution, and persistence are the Architect's job.

3. **Free prose → structured intents** — The actor outputs free natural-language prose. This is fed to the `IntentDecoder`, which splits and classifies it into a sequence of typed intents.

## Prompt Structure

The actor prompt is assembled by `ActorPromptBuilder` and has two parts:

### System Prompt

Establishes the role, rules, and output contract:

- The LLM **is** the character, not a narrator or system.
- The character may produce three kinds of behavior:
  - **Spoken dialogue** → `dialogue` intent.
  - **Physical/logical action** → `action` intent.
  - **Inner thought / reflection** → `monologue` intent.
- The character must stay in-character, respect its knowledge bounds, and refer to others by subjective aliases (not system UUIDs).
- Not every turn requires an outward action — internal monologue alone is valid.
- The character controls only itself.

### User Context

Epistemically bounded, with these sections:

| Section                      | Content                                                                                            | Source                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Current moment               | The subjective present time                                                                        | `worldState.clock.get().toISOString()` |
| The world as you perceive it | Self-visible attributes, co-located entities + their visible attributes, other presences elsewhere | `serializeSubjectiveWorldState()`      |
| Your recent memory           | Recent `BufferEntry`s, alias-substituted, with relative time phrasing                              | `serializeSubjectiveBufferEntry()`     |

No system UUIDs, no private attributes the entity lacks ACL access to, and no objective-world-state dump are present.

## The Monologue Intent Type

Monologue (`"monologue"`) is the third intent type. Its properties:

- **No perceiver** — `targetIds` is always `[]`. No other entity perceives or can react to a monologue.
- **No validation** — The Architect's `processIntent` short-circuits for monologues.
- **Direct-to-memory** — Written directly to the actor's buffer with no `outcome` field.
- **Defensive guard** — `LLMValidator.validate` has an early-return guard so a stray monologue can never reach the validation LLM.

## Flow

```
[ActorAgent.act()]
  │
  ├─ 1. ActorPromptBuilder.build(entity, worldState)
  │      → system prompt + user context (subjective world + memory + time)
  │
  ├─ 2. IActorProseGenerator.generate(entityId, systemPrompt, userContext)
  │      ├─ LLMActorProseGenerator: queries LLM via generateStructuredResponse
  │      └─ CLIProseGenerator: prompts human player via CLI / readline interface
  │      → narrativeProse: string
  │
  ├─ 3. IntentDecoder.decode(worldState, actorId, prose)
  │      → IntentSequence (dialogue | action | monologue intents)
  │
  └─ returns { narrativeProse, intents }

[Caller (e.g. game loop)]
  │
  ├─ for each intent in intents:
  │   ├─ if intent.type === "monologue": short-circuit, write to buffer
  │   ├─ if intent.type === "dialogue": validate (always valid), write to buffer
  │   └─ if intent.type === "action": validate, generate time delta, advance clock
  │
  └─ world state persisted to DB
```

## Key Files

| File                                         | Role                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| `packages/actor/src/actor-prompt-builder.ts` | Assembles the epistemically-bounded actor prompt             |
| `packages/actor/src/actor.ts`                | `ActorAgent` class: orchestrates prompt → LLM → decoder flow |
| `packages/actor/src/index.ts`                | Package exports                                              |
| `packages/core/src/world.ts:72`              | `serializeSubjectiveWorldState()`                            |
| `packages/intent/src/intent.ts:8`            | `IntentTypeSchema` — includes `"monologue"`                  |
| `packages/intent/src/intent-decoder.ts:30`   | Decoder system prompt                                        |
| `packages/architect/src/architect.ts:35`     | Monologue short-circuit                                      |
| `packages/architect/src/llm-validator.ts:19` | Defensive monologue guard                                    |
