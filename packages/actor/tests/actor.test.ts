import { describe, it, expect } from "vitest";
import { WorldState, Entity } from "@omnia/core";
import { ActorAgent } from "../src/actor.js";
import { MockLLMProvider } from "@omnia/llm";

describe("ActorAgent Unit Tests", () => {
  it("should throw an error if trying to act with a non-agent entity", async () => {
    const world = new WorldState("world-123");
    const nonAgentEntity = new Entity("stone", null, false); // isAgent = false
    world.addEntity(nonAgentEntity);

    const mockLlm = new MockLLMProvider([]);
    const actor = new ActorAgent(mockLlm);

    await expect(actor.act(world, nonAgentEntity)).rejects.toThrow(
      'Entity "stone" is not an agent and cannot use the actor interface.',
    );
  });
});
