"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AttributeEditor } from "./AttributeEditor";
import { Plus, Trash2 } from "lucide-react";
import type { LocationData, ConnectionData, EntityData } from "./types";
import { getLocationDisplayName, getLocationDisplayNameById } from "./utils";
import { WorldMap } from "./WorldMap";

interface LocationsTabProps {
  locations: LocationData[];
  setLocations: (locs: LocationData[]) => void;
  entities: EntityData[];
  locationIds: string[];
  entityIds: string[];
  selectedLocIndex: number;
  setSelectedLocIndex: (idx: number) => void;
  generateUUID: () => string;
}

export function LocationsTab({
  locations,
  setLocations,
  entities,
  locationIds,
  entityIds,
  selectedLocIndex,
  setSelectedLocIndex,
  generateUUID,
}: LocationsTabProps) {
  const addLocationConnection = (locIndex: number) => {
    const copy = [...locations];
    copy[locIndex].connections = [
      ...copy[locIndex].connections,
      {
        targetId:
          locationIds.filter((id) => id !== locations[locIndex].id)[0] || "",
        visionProp: 10,
        soundProp: 10,
        bidirectional: true,
      },
    ];
    setLocations(copy);
  };

  const updateLocationConnection = <K extends keyof ConnectionData>(
    locIndex: number,
    connIndex: number,
    key: K,
    val: ConnectionData[K],
  ) => {
    const copy = [...locations];
    copy[locIndex].connections[connIndex] = {
      ...copy[locIndex].connections[connIndex],
      [key]: val,
    };
    setLocations(copy);
  };

  const removeLocationConnection = (locIndex: number, connIndex: number) => {
    const copy = [...locations];
    copy[locIndex].connections = copy[locIndex].connections.filter(
      (_, i) => i !== connIndex,
    );
    setLocations(copy);
  };

  const selectedLoc = locations[selectedLocIndex];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start min-h-0 pb-12">
      {/* Map Visualizer */}
      {locations.length > 0 && (
        <div className="md:col-span-4 w-full">
          <WorldMap
            locations={locations}
            selectedLocId={selectedLoc?.id}
            onSelectLocId={(id) => {
              const idx = locations.findIndex((l) => l.id === id);
              if (idx !== -1) setSelectedLocIndex(idx);
            }}
          />
        </div>
      )}

      {/* Left sidebar: Locations list */}
      <div className="md:col-span-1 border border-border/20 bg-card shadow-[2px_2px_0_0_var(--border)] flex flex-col max-h-[500px]">
        <div className="p-3 border-b border-border/25 flex justify-between items-center bg-secondary/15">
          <strong className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Locations
          </strong>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const newId = generateUUID();
              setLocations([
                ...locations,
                { id: newId, attributes: [], connections: [] },
              ]);
              setSelectedLocIndex(locations.length);
            }}
            className="h-6 text-[10px] px-2 flex gap-1 cursor-pointer"
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>
        <div className="overflow-y-auto divide-y divide-border/10 flex-1">
          {locations.map((loc, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedLocIndex(idx)}
              className={`p-3 text-xs font-mono cursor-pointer flex justify-between items-center transition-all ${
                selectedLocIndex === idx
                  ? "bg-primary/10 text-primary font-bold border-l-4 border-primary"
                  : "hover:bg-secondary/40 text-foreground"
              }`}
            >
              <span className="truncate">
                {getLocationDisplayName(loc) || `(Empty ID)`}
              </span>
              {locations.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newLocs = locations.filter((_, i) => i !== idx);
                    setLocations(newLocs);
                    setSelectedLocIndex(Math.max(0, idx - 1));
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors pl-2 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel wrapper */}
      <div className="md:col-span-3 space-y-6">
        {selectedLoc ? (
          <div className="border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic location fields */}
            <div className="space-y-4">
              <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">
                Location Configuration
              </h2>

              <div className="space-y-1.5">
                <Label>Location ID</Label>
                <Input
                  value={selectedLoc.id}
                  readOnly
                  className="font-mono text-xs bg-muted cursor-not-allowed text-muted-foreground"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Parent Location (Optional)</Label>
                <select
                  className="bg-card border border-border/30 px-3 py-1.5 text-xs outline-none w-full rounded"
                  value={selectedLoc.parentId || ""}
                  onChange={(e) => {
                    const copy = [...locations];
                    copy[selectedLocIndex].parentId =
                      e.target.value || undefined;
                    setLocations(copy);
                  }}
                >
                  <option value="">-- No parent --</option>
                  {locationIds
                    .filter((id) => id !== selectedLoc.id)
                    .map((id) => (
                      <option key={id} value={id}>
                        {getLocationDisplayNameById(id, locations)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Attributes for Location */}
              <div className="pt-2">
                <AttributeEditor
                  title="Location Attributes"
                  attributes={selectedLoc.attributes || []}
                  onChange={(newAttrs) => {
                    const copy = [...locations];
                    copy[selectedLocIndex].attributes = newAttrs;
                    setLocations(copy);
                  }}
                  onAdd={() => {
                    const copy = [...locations];
                    copy[selectedLocIndex].attributes = [
                      ...copy[selectedLocIndex].attributes,
                      {
                        name: "",
                        value: "",
                        visibility: "PUBLIC",
                        allowedEntities: [],
                      },
                    ];
                    setLocations(copy);
                  }}
                  entityIds={entityIds}
                  entities={entities}
                />
              </div>
            </div>

            {/* Connections (spatial paths) */}
            <div className="space-y-4 border-t lg:border-t-0 lg:border-l border-border/20 lg:pl-6 pt-4 lg:pt-0">
              <div className="flex justify-between items-center border-b border-border/20 pb-2">
                <h3 className="text-body-md text-foreground font-bold">
                  Connections / Portals
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addLocationConnection(selectedLocIndex)}
                  className="h-7 text-xs flex gap-1 cursor-pointer"
                >
                  <Plus className="size-3" /> Add Connection
                </Button>
              </div>

              {!selectedLoc.connections ||
              selectedLoc.connections.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No connections leading from this location.
                </p>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-1">
                  {selectedLoc.connections.map((conn, connIdx) => (
                    <div
                      key={connIdx}
                      className="border border-border/20 bg-secondary/10 p-3 rounded space-y-3 relative group"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          removeLocationConnection(selectedLocIndex, connIdx)
                        }
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive cursor-pointer"
                        title="Delete connection"
                      >
                        <Trash2 className="size-3.5" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Target Location
                          </span>
                          <select
                            className="bg-card border border-border/30 px-2 py-1 text-xs outline-none w-full rounded"
                            value={conn.targetId}
                            onChange={(e) =>
                              updateLocationConnection(
                                selectedLocIndex,
                                connIdx,
                                "targetId",
                                e.target.value,
                              )
                            }
                          >
                            <option value="">-- Choose target --</option>
                            {locationIds
                              .filter((id) => id !== selectedLoc.id)
                              .map((id) => (
                                <option key={id} value={id}>
                                  {getLocationDisplayNameById(id, locations)}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Portal Name
                          </span>
                          <Input
                            placeholder="e.g. wooden door"
                            value={conn.portalName || ""}
                            onChange={(e) =>
                              updateLocationConnection(
                                selectedLocIndex,
                                connIdx,
                                "portalName",
                                e.target.value,
                              )
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          Portal State
                        </span>
                        <Input
                          placeholder="e.g. locked, closed, heavy iron gate"
                          value={conn.portalStateDescriptor || ""}
                          onChange={(e) =>
                            updateLocationConnection(
                              selectedLocIndex,
                              connIdx,
                              "portalStateDescriptor",
                              e.target.value,
                            )
                          }
                          className="h-7 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground block">
                            Vision Propagation ({conn.visionProp})
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={conn.visionProp}
                            onChange={(e) =>
                              updateLocationConnection(
                                selectedLocIndex,
                                connIdx,
                                "visionProp",
                                Number(e.target.value),
                              )
                            }
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground block">
                            Sound Propagation ({conn.soundProp})
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={conn.soundProp}
                            onChange={(e) =>
                              updateLocationConnection(
                                selectedLocIndex,
                                connIdx,
                                "soundProp",
                                Number(e.target.value),
                              )
                            }
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={conn.bidirectional}
                            onCheckedChange={(checked) =>
                              updateLocationConnection(
                                selectedLocIndex,
                                connIdx,
                                "bidirectional",
                                !!checked,
                              )
                            }
                          />
                          Bidirectional Connection (creates reverse path
                          automatically)
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] text-center py-12 text-xs text-muted-foreground">
            No location selected. Choose a location from the sidebar to edit, or
            view the world layout below.
          </div>
        )}
      </div>
    </div>
  );
}
