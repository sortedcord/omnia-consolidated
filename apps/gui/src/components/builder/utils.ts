import type { EntityData, LocationData } from "./types";

export function getEntityDisplayName(
  entity: EntityData | undefined,
  fallbackId: string = "",
): string {
  if (!entity) return fallbackId;
  const nameAttr = entity.attributes?.find(
    (a) => a.name.toLowerCase() === "name",
  );
  if (nameAttr?.value) {
    return `${nameAttr.value} (${entity.id})`;
  }
  return entity.id;
}

export function getEntityDisplayNameById(
  id: string,
  entities: EntityData[],
): string {
  const entity = entities.find((e) => e.id === id);
  return getEntityDisplayName(entity, id);
}

export function getLocationDisplayName(
  location: LocationData | undefined,
  fallbackId: string = "",
): string {
  if (!location) return fallbackId;
  const nameAttr = location.attributes?.find(
    (a) => a.name.toLowerCase() === "name",
  );
  if (nameAttr?.value) {
    return `${nameAttr.value} (${location.id})`;
  }
  return location.id;
}

export function getLocationDisplayNameById(
  id: string,
  locations: LocationData[],
): string {
  const location = locations.find((l) => l.id === id);
  return getLocationDisplayName(location, id);
}
