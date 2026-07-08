import { AttributableObject } from "./attribute.js";

export class Entity extends AttributableObject {
  locationId: string | null = null;
  readonly aliases: Map<string, string> = new Map();

  constructor(id?: string, locationId?: string | null) {
    super(id);
    this.locationId = locationId ?? null;
  }
}
