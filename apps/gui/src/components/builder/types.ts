export interface AttributeData {
  name: string;
  value: string;
  visibility: "PUBLIC" | "PRIVATE";
  allowedEntities: string[];
}

export interface ConnectionData {
  targetId: string;
  portalName?: string;
  portalStateDescriptor?: string;
  visionProp: number;
  soundProp: number;
  bidirectional: boolean;
}

export interface LocationData {
  id: string;
  parentId?: string;
  attributes: AttributeData[];
  connections: ConnectionData[];
}

export interface MemoryData {
  id: string;
  timestamp: string;
  locationId: string | null;
  intent: {
    type: "dialogue" | "action" | "monologue";
    originalText: string;
    description: string;
    selfDescription?: string;
    actorId: string;
    targetIds: string[];
    modifiers?: string[];
  };
  outcome?: {
    isValid: boolean;
    reason: string;
  };
}

export interface EntityData {
  id: string;
  locationId?: string;
  attributes: AttributeData[];
  aliases: Record<string, string>;
  initialMemories: MemoryData[];
  isAgent?: boolean;
}
