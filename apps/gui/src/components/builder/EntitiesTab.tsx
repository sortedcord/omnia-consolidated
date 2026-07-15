"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AttributeEditor } from "./AttributeEditor";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import type { EntityData, MemoryData, LocationData } from "./types";
import {
  getEntityDisplayName,
  getEntityDisplayNameById,
  getLocationDisplayNameById,
} from "./utils";

interface EntitiesTabProps {
  entities: EntityData[];
  setEntities: (ents: EntityData[]) => void;
  locations: LocationData[];
  locationIds: string[];
  entityIds: string[];
  selectedEntIndex: number;
  setSelectedEntIndex: (idx: number) => void;
  startTime: string;
  generateUUID: () => string;
}

export function EntitiesTab({
  entities,
  setEntities,
  locations,
  locationIds,
  entityIds,
  selectedEntIndex,
  setSelectedEntIndex,
  startTime,
  generateUUID,
}: EntitiesTabProps) {
  const selectedEnt = entities[selectedEntIndex];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start min-h-0 pb-12">
      {/* Left sidebar: Entities list */}
      <div className="md:col-span-1 border border-border/20 bg-card shadow-[2px_2px_0_0_var(--border)] flex flex-col max-h-[500px]">
        <div className="p-3 border-b border-border/25 flex justify-between items-center bg-secondary/15">
          <strong className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Entities
          </strong>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const newId = generateUUID();
              setEntities([
                ...entities,
                {
                  id: newId,
                  locationId: locationIds[0],
                  attributes: [],
                  aliases: {},
                  initialMemories: [],
                  isAgent: true,
                },
              ]);
              setSelectedEntIndex(entities.length);
            }}
            className="h-6 text-[10px] px-2 flex gap-1 cursor-pointer"
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>
        <div className="overflow-y-auto divide-y divide-border/10 flex-1">
          {entities.map((ent, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedEntIndex(idx)}
              className={`p-3 text-xs font-mono cursor-pointer flex justify-between items-center transition-all ${
                selectedEntIndex === idx
                  ? "bg-primary/10 text-primary font-bold border-l-4 border-primary"
                  : "hover:bg-secondary/40 text-foreground"
              }`}
            >
              <span className="truncate">
                {getEntityDisplayName(ent) || `(Empty ID)`}
              </span>
              {entities.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newEnts = entities.filter((_, i) => i !== idx);
                    setEntities(newEnts);
                    setSelectedEntIndex(Math.max(0, idx - 1));
                  }}
                  className="text-muted-foreground hover:text-destructive pl-2 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: Edit selected entity details */}
      {selectedEnt ? (
        <div className="md:col-span-3 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: ID, Location, Attributes */}
          <div className="space-y-4">
            <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">
              Entity Configuration
            </h2>

            <div className="space-y-1.5">
              <Label>Entity ID</Label>
              <Input
                value={selectedEnt.id}
                readOnly
                className="font-mono text-xs bg-muted cursor-not-allowed text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Current Location</Label>
              <select
                className="bg-card border border-border/30 px-3 py-1.5 text-xs outline-none w-full rounded font-mono"
                value={selectedEnt.locationId || ""}
                onChange={(e) => {
                  const copy = [...entities];
                  copy[selectedEntIndex].locationId =
                    e.target.value || undefined;
                  setEntities(copy);
                }}
              >
                <option value="">-- No Location (floating) --</option>
                {locationIds.map((id) => (
                  <option key={id} value={id}>
                    {getLocationDisplayNameById(id, locations)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 pt-1 pb-2">
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground cursor-pointer flex items-center gap-1.5 text-sm font-semibold">
                  <Checkbox
                    checked={selectedEnt.isAgent !== false}
                    onCheckedChange={(checked) => {
                      const copy = [...entities];
                      copy[selectedEntIndex].isAgent = !!checked;
                      setEntities(copy);
                    }}
                  />
                  Is Agent?
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground/75 pl-5 select-none leading-normal">
                When enabled, this entity will run an autonomous LLM loop to
                perceive its environment, update its memories, and generate
                prose narrative actions.
              </p>
            </div>

            {/* Attributes */}
            <div className="pt-2">
              <AttributeEditor
                title="Entity Attributes"
                attributes={selectedEnt.attributes || []}
                onChange={(newAttrs) => {
                  const copy = [...entities];
                  copy[selectedEntIndex].attributes = newAttrs;
                  setEntities(copy);
                }}
                onAdd={() => {
                  const copy = [...entities];
                  copy[selectedEntIndex].attributes = [
                    ...copy[selectedEntIndex].attributes,
                    {
                      name: "",
                      value: "",
                      visibility: "PUBLIC",
                      allowedEntities: [],
                    },
                  ];
                  setEntities(copy);
                }}
                entityIds={entityIds}
                entities={entities}
              />
            </div>
          </div>

          {/* Column 2: Aliases and Initial Memories */}
          <div className="space-y-6 border-t lg:border-t-0 lg:border-l border-border/20 lg:pl-6 pt-4 lg:pt-0">
            {/* Aliases Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-border/20 pb-2">
                <h3 className="text-body-md text-foreground font-bold">
                  Aliases (Perceptions)
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const copy = [...entities];
                    const target = entityIds.find(
                      (id) => id !== selectedEnt.id && !selectedEnt.aliases[id],
                    );
                    if (target) {
                      copy[selectedEntIndex].aliases = {
                        ...selectedEnt.aliases,
                        [target]: "",
                      };
                      setEntities(copy);
                    }
                  }}
                  disabled={entityIds.length <= 1}
                  className="h-7 text-xs flex gap-1 cursor-pointer"
                >
                  <Plus className="size-3" /> Add Alias
                </Button>
              </div>

              {Object.keys(selectedEnt.aliases || {}).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No descriptive aliases configured. Defaults to actual entity
                  ID.
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(selectedEnt.aliases).map(
                    ([targetId, aliasText]) => (
                      <div
                        key={targetId}
                        className="flex gap-2 items-center bg-secondary/15 p-2 rounded"
                      >
                        <span
                          className="text-[11px] font-mono text-muted-foreground w-1/3 truncate"
                          title={targetId}
                        >
                          {getEntityDisplayNameById(targetId, entities)}
                        </span>
                        <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                        <Input
                          placeholder="Descriptive name (e.g. the guard)"
                          value={aliasText}
                          onChange={(e) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].aliases = {
                              ...selectedEnt.aliases,
                              [targetId]: e.target.value,
                            };
                            setEntities(copy);
                          }}
                          className="h-7 text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = [...entities];
                            const updated = { ...selectedEnt.aliases };
                            delete updated[targetId];
                            copy[selectedEntIndex].aliases = updated;
                            setEntities(copy);
                          }}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Initial Memories Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-border/20 pb-2">
                <h3 className="text-body-md text-foreground font-bold">
                  Initial Memories
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const copy = [...entities];
                    const newMem: MemoryData = {
                      id: generateUUID(),
                      timestamp: startTime,
                      locationId: selectedEnt.locationId || null,
                      intent: {
                        type: "dialogue",
                        originalText: "",
                        description: "",
                        actorId: selectedEnt.id,
                        targetIds: [],
                      },
                    };
                    copy[selectedEntIndex].initialMemories = [
                      ...selectedEnt.initialMemories,
                      newMem,
                    ];
                    setEntities(copy);
                  }}
                  className="h-7 text-xs flex gap-1 cursor-pointer"
                >
                  <Plus className="size-3" /> Add Memory
                </Button>
              </div>

              {!selectedEnt.initialMemories ||
              selectedEnt.initialMemories.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No initial memories loaded. Entities will start blank.
                </p>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[300px] pr-1">
                  {selectedEnt.initialMemories.map((mem, memIdx) => (
                    <div
                      key={mem.id}
                      className="border border-border/20 bg-secondary/5 p-3 rounded space-y-3 relative"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const copy = [...entities];
                          copy[selectedEntIndex].initialMemories =
                            selectedEnt.initialMemories.filter(
                              (_, i) => i !== memIdx,
                            );
                          setEntities(copy);
                        }}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Type
                          </span>
                          <select
                            className="bg-card border border-border/30 px-2 py-0.5 text-xs outline-none w-full rounded"
                            value={mem.intent.type}
                            onChange={(e) => {
                              const copy = [...entities];
                              copy[selectedEntIndex].initialMemories[
                                memIdx
                              ].intent.type = e.target.value as
                                "dialogue" | "action" | "monologue";
                              setEntities(copy);
                            }}
                          >
                            <option value="dialogue">Dialogue</option>
                            <option value="action">Action</option>
                            <option value="monologue">Monologue</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Location
                          </span>
                          <select
                            className="bg-card border border-border/30 px-2 py-0.5 text-xs outline-none w-full rounded font-mono"
                            value={mem.locationId || ""}
                            onChange={(e) => {
                              const copy = [...entities];
                              copy[selectedEntIndex].initialMemories[
                                memIdx
                              ].locationId = e.target.value || null;
                              setEntities(copy);
                            }}
                          >
                            <option value="">-- Nowhere --</option>
                            {locationIds.map((id) => (
                              <option key={id} value={id}>
                                {getLocationDisplayNameById(id, locations)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          Verbatim Text (originalText)
                        </span>
                        <Input
                          placeholder='e.g. "We should leave," Alice said.'
                          value={mem.intent.originalText}
                          onChange={(e) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].initialMemories[
                              memIdx
                            ].intent.originalText = e.target.value;
                            setEntities(copy);
                          }}
                          className="h-7 text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          Objective Description
                        </span>
                        <Input
                          placeholder="e.g. Alice says she wants to leave."
                          value={mem.intent.description}
                          onChange={(e) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].initialMemories[
                              memIdx
                            ].intent.description = e.target.value;
                            setEntities(copy);
                          }}
                          className="h-7 text-xs"
                        />
                      </div>

                      {/* Targets multi-select */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-muted-foreground block">
                          Involved Targets
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {entityIds
                            .filter((id) => id !== selectedEnt.id)
                            .map((entId) => {
                              const isSelected =
                                mem.intent.targetIds?.includes(entId);
                              return (
                                <button
                                  key={entId}
                                  type="button"
                                  onClick={() => {
                                    const copy = [...entities];
                                    const targets =
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].intent.targetIds || [];
                                    if (targets.includes(entId)) {
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].intent.targetIds = targets.filter(
                                        (t) => t !== entId,
                                      );
                                    } else {
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].intent.targetIds = [...targets, entId];
                                    }
                                    setEntities(copy);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-primary/20 border-primary text-primary"
                                      : "bg-background border-border/30 text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  {getEntityDisplayNameById(entId, entities)}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Action Validation outcome */}
                      {mem.intent.type === "action" && (
                        <div className="border-t border-border/20 pt-2 space-y-2">
                          <Label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={!!mem.outcome}
                              onCheckedChange={(checked) => {
                                const copy = [...entities];
                                if (checked) {
                                  copy[selectedEntIndex].initialMemories[
                                    memIdx
                                  ].outcome = { isValid: true, reason: "" };
                                } else {
                                  copy[selectedEntIndex].initialMemories[
                                    memIdx
                                  ].outcome = undefined;
                                }
                                setEntities(copy);
                              }}
                            />
                            Include validation outcome
                          </Label>
                          {mem.outcome && (
                            <div className="grid grid-cols-3 gap-2 bg-secondary/15 p-2 rounded">
                              <div className="col-span-1 flex flex-col justify-center">
                                <Label className="text-[9px] mb-1">
                                  isValid
                                </Label>
                                <Checkbox
                                  checked={mem.outcome.isValid}
                                  onCheckedChange={(checked) => {
                                    const copy = [...entities];
                                    if (
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].outcome
                                    ) {
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].outcome!.isValid = !!checked;
                                      setEntities(copy);
                                    }
                                  }}
                                />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-[9px]">Reason</Label>
                                <Input
                                  placeholder="Reason for valid/invalid status"
                                  value={mem.outcome.reason}
                                  onChange={(e) => {
                                    const copy = [...entities];
                                    if (
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].outcome
                                    ) {
                                      copy[selectedEntIndex].initialMemories[
                                        memIdx
                                      ].outcome!.reason = e.target.value;
                                      setEntities(copy);
                                    }
                                  }}
                                  className="h-6 text-[10px]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="md:col-span-3 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] text-center text-xs text-muted-foreground">
          No entities defined.
        </div>
      )}
    </div>
  );
}
