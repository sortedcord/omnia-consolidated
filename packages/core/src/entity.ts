import { AttributableObject } from "./attribute.js";

export class Entity extends AttributableObject {
  locationId: string | null = null;

  constructor(id?: string, locationId?: string | null) {
    super(id);
    this.locationId = locationId ?? null;
  }

  override serialize(): string {
    const lines: string[] = [];
    if (this.locationId) {
      lines.push(`* Location ID: ${this.locationId}`);
    }
    const selfSerialized = super.serialize();
    if (selfSerialized) {
      lines.push(selfSerialized);
    }
    return lines.join("\n");
  }
}
