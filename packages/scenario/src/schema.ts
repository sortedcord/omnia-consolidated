import { z } from "zod";

export const AttributeVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const ScenarioAttributeSchema = z.object({
  name: z.string(),
  value: z.string(),
  visibility: AttributeVisibilitySchema,
  allowedEntities: z.array(z.string()).optional(),
});

export const ScenarioPortalConnectionSchema = z.object({
  targetId: z.string(),
  portalName: z.string().optional(),
  portalStateDescriptor: z.string().optional(),
  visionProp: z.number().min(0).max(10),
  soundProp: z.number().min(0).max(10),
  bidirectional: z.boolean(),
});

export const ScenarioLocationSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  attributes: z.array(ScenarioAttributeSchema).optional(),
  connections: z.array(ScenarioPortalConnectionSchema).optional(),
});

export const ScenarioMemoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(), // ISO string
  locationId: z.string().nullable(),
  intent: z.object({
    type: z.enum(["dialogue", "action", "monologue"]),
    originalText: z.string(),
    description: z.string(),
    selfDescription: z.string().optional(),
    actorId: z.string(),
    targetIds: z.array(z.string()),
    modifiers: z.array(z.string()).optional(),
  }),
  outcome: z
    .object({
      isValid: z.boolean(),
      reason: z.string(),
    })
    .optional(),
});

export const ScenarioEntitySchema = z.object({
  id: z.string(),
  locationId: z.string().nullable().optional(),
  attributes: z.array(ScenarioAttributeSchema).optional(),
  aliases: z.record(z.string(), z.string()).optional(), // targetId -> subjective descriptor
  initialMemories: z.array(ScenarioMemoryEntrySchema).optional(),
  isAgent: z.boolean().optional(),
});

export const ScenarioSchema = z.object({
  id: z.string(), // Template identifier
  name: z.string(),
  description: z.string(),
  startTime: z.string(), // ISO string
  world: z
    .object({
      attributes: z.array(ScenarioAttributeSchema).optional(),
    })
    .optional(),
  locations: z.array(ScenarioLocationSchema).optional(),
  entities: z.array(ScenarioEntitySchema).optional(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
