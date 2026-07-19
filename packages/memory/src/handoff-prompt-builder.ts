import { Entity } from "@omnia/core";
import { PromptBreakdown, PromptComponent, IPromptBuilder } from "@omnia/llm";
import { BufferEntry, serializeSubjectiveBufferEntry } from "./buffer.js";

/**
 * Prompt builder for the Handoff Engine.
 * Separates prompt generation, structure, and component breakdowns.
 */
export class HandoffPromptBuilder implements IPromptBuilder<
  [Entity, BufferEntry[], Date]
> {
  build(entity: Entity, candidates: BufferEntry[], now: Date): PromptBreakdown {
    const candidatesList = candidates
      .map((entry) => {
        const serialized = serializeSubjectiveBufferEntry(entry, entity);
        return `ID: ${entry.id} | Timestamp: ${entry.timestamp} | Location: ${entry.locationId || "None"}\nContent: ${serialized}`;
      })
      .join("\n---\n");

    const systemPrompt = `
You are the memory Handoff Engine. Your task is to process a list of Cognitive Buffer entries for an entity and select which memories to promote to the Memory Ledger, and which to forget or summarize.

Instructions:
1. **Cluster** related consecutive buffer entries into high-level narrative beats or events (e.g. physical action and its outcome or trivial actions). Combine them into a single chunk.
2. **Write in the third-person** for the events of other entities. (eg. Alan did that. Sarah did this, etc)
2. **Write in first-person for the events that you yourself did. (eg. I did this, I did that.)
3. **verbatim Quotes**: Extract verbatim, high-salience quotes from dialogue if relevant. Do not modify or invent quotes.
4. **Determine Importance**: Assign an importance score from 1 (trivial, e.g. waking up) to 10 (life-altering, e.g. witnessing a crime).
4. Discard small body movements like looking around, sighing, etc that do not contextually hold any meaning after it is done.
5. **Involved Entities**: Identify all entity IDs involved in the memories in this chunk.
6. **Retain in Cognitive Buffer (Pinning)**: If a beat represents an unresolved high-stakes situation (e.g. a standing threat, an unanswered accusation, an ongoing chase or conflict), set "retainInBuffer" to true so it remains in the Cognitive Buffer for immediate context. Otherwise, set it to false so it is safely pruned from the Cognitive Buffer.
7. **Exclude stage business**: Glances, sighs, ambient noticing, and irrelevant sensory details should be ignored and not included in any promoted chunk. They will be forgotten.
8. **Forget by omission**: Any buffer entry ID that you do not include in any chunk's "sourceEntryIds" will be permanently deleted and forgotten.
`.trim();

    const entityContext = `
Subject Entity ID: ${entity.id}
Current Time: ${now.toISOString()}
`.trim();

    const candidatesSection = `Cognitive Buffer Candidates for Handoff:\n${candidatesList}`;

    const userContext = `${entityContext}\n\n${candidatesSection}`;

    const components: PromptComponent[] = [
      { label: "System Prompt", type: "system", content: systemPrompt },
      { label: "Entity Context", type: "world", content: entityContext },
      {
        label: "Cognitive Candidates",
        type: "input",
        content: candidatesSection,
      },
    ];

    return {
      systemPrompt,
      userContext,
      components,
    };
  }
}
