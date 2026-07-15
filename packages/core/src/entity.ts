import { AttributableObject } from "./attribute.js";

export class Entity extends AttributableObject {
  locationId: string | null = null;
  readonly aliases: Map<string, string> = new Map();
  isAgent: boolean = true;

  constructor(id?: string, locationId?: string | null, isAgent?: boolean) {
    super(id);
    this.locationId = locationId ?? null;
    this.isAgent = isAgent ?? true;
  }
}
