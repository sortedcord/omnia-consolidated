export enum AttributeVisibility {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
}

export class Attribute {
  readonly name: string;
  private value: string;
  private visibility: AttributeVisibility;
  private allowedEntities: Set<string>;

  constructor(name: string, value: string, visibility: AttributeVisibility) {
    this.name = name;
    this.value = value;
    this.visibility = visibility;
    this.allowedEntities = new Set();
  }

  setValue(newValue: string) {
    this.value = newValue;
  }

  getValue(): string {
    return this.value;
  }

  hasAccess(objectId: string): boolean {
    return (
      this.visibility === AttributeVisibility.PUBLIC ||
      this.allowedEntities.has(objectId)
    );
  }

  getVisibility(): AttributeVisibility {
    return this.visibility;
  }

  setPublic() {
    this.visibility = AttributeVisibility.PUBLIC;
  }

  setPrivate() {
    this.allowedEntities.clear();
    this.visibility = AttributeVisibility.PRIVATE;
  }

  grantAccess(objectId: string) {
    if (this.visibility === AttributeVisibility.PRIVATE) {
      this.allowedEntities.add(objectId);
    }
  }

  revokeAccess(objectId: string) {
    if (
      this.visibility === AttributeVisibility.PRIVATE &&
      this.allowedEntities.has(objectId)
    ) {
      this.allowedEntities.delete(objectId);
    }
  }

  getAllowedEntities(): Set<string> {
    return new Set(this.allowedEntities);
  }
}

export interface IAttribute {
  id: string;
  attributes: Map<string, Attribute>;

  addAttribute(
    name: string,
    value: string,
    visibility: AttributeVisibility,
    allowedEntities: Set<string> | null,
  ): void;
  getVisibleAttributesFor(viewerId: string): Attribute[];
}

export abstract class AttributableObject implements IAttribute {
  readonly id: string;
  readonly attributes: Map<string, Attribute> = new Map<string, Attribute>();

  constructor(id?: string) {
    this.id = id ?? crypto.randomUUID();
  }

  addAttribute(
    name: string,
    value: string,
    visibility: AttributeVisibility = AttributeVisibility.PRIVATE,
    allowedEntities: Set<string> | null = null,
  ): void {
    if (this.attributes.has(name))
      throw Error(`Attribute ${name} already exists`);

    this.attributes.set(name, new Attribute(name, value, visibility));
    if (visibility === AttributeVisibility.PRIVATE && allowedEntities != null) {
      for (const entity of allowedEntities) {
        this.attributes.get(name)?.grantAccess(entity);
      }
    }
  }

  removeAttribute(name: string): void {
    if (!this.attributes.has(name))
      throw Error(`Attribute ${name} does not exist`);
    this.attributes.delete(name);
  }

  getVisibleAttributesFor(viewerId: string): Attribute[] {
    return Array.from(this.attributes.values()).filter((attr) =>
      attr.hasAccess(viewerId),
    );
  }
}

export function serializeAttributes(attributes: Attribute[]): string {
  const lines: string[] = [];
  for (const attr of attributes) {
    const aclList = Array.from(attr.getAllowedEntities());
    const aclStr =
      aclList.length > 0 ? ` (Visible to: ${aclList.join(", ")})` : "";
    lines.push(
      `* ${attr.name}: ${attr.getValue()} (Visibility: ${attr.getVisibility()})${aclStr}`,
    );
  }
  return lines.join("\n");
}
