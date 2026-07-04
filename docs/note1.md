# Names and LLMs

- While redesigning ../packages/core/index.ts a fundamental issue came up. Something as simple as name is set to private. Because by common sense, an entity's name isn't common knowledge. You don't instantly know another person's name.
- So, although the internal system can identify an entity by it's id (which is defined in the lower level AttributableObject by default), UUIds aren't very helpful for something like LLMs be it the NPC Agent or the Architect Agent.
- An extension of this problem is unnamed entities. How does the architect orchestrate changes for such an entity when it doesn't even have a name?
- Also, if we fixate on NPC agents using identifiers like, "the hooded man", there is nothing stopping them from using other identifiers like "the shadowey man" in the next action or even make up names due to the inherent nature of LLMs.
- This just becomes a nightmare to deal with when parsing LLM responses to find out involved entities.
