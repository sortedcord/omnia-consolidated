"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import type { AttributeData, EntityData } from "./types";
import { getEntityDisplayNameById } from "./utils";

interface AttributeEditorProps {
  title?: string;
  attributes: AttributeData[];
  onChange: (attrs: AttributeData[]) => void;
  onAdd: () => void;
  entityIds: string[];
  entities?: EntityData[];
}

export function AttributeEditor({
  title = "Attributes",
  attributes,
  onChange,
  onAdd,
  entityIds,
  entities,
}: AttributeEditorProps) {
  const handleAttrChange = <K extends keyof AttributeData>(
    index: number,
    key: K,
    val: AttributeData[K],
  ) => {
    const copy = [...attributes];
    copy[index] = { ...copy[index], [key]: val };
    onChange(copy);
  };

  const handleToggleEntityAccess = (index: number, entId: string) => {
    const copy = [...attributes];
    const allowed = copy[index].allowedEntities || [];
    if (allowed.includes(entId)) {
      copy[index].allowedEntities = allowed.filter((id) => id !== entId);
    } else {
      copy[index].allowedEntities = [...allowed, entId];
    }
    onChange(copy);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-border/20 pb-2">
        <h3 className="text-body-md font-mono text-foreground font-bold">
          {title}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAdd}
          className="h-7 text-xs flex gap-1 cursor-pointer"
        >
          <Plus className="size-3" /> Add Attribute
        </Button>
      </div>
      {attributes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No attributes defined yet.
        </p>
      ) : (
        <div className="space-y-3">
          {attributes.map((attr, index) => (
            <div
              key={index}
              className="border border-border/20 bg-secondary/10 p-3 rounded space-y-3"
            >
              <div className="flex gap-2 items-center">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Name (e.g. role)"
                    value={attr.name}
                    onChange={(e) =>
                      handleAttrChange(index, "name", e.target.value)
                    }
                    className="h-8 font-mono text-xs"
                  />
                  <Input
                    placeholder="Value (e.g. merchant)"
                    value={attr.value}
                    onChange={(e) =>
                      handleAttrChange(index, "value", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="size-8 shrink-0 cursor-pointer"
                  onClick={() =>
                    onChange(attributes.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground cursor-pointer flex items-center gap-1.5">
                    <Checkbox
                      checked={attr.visibility === "PUBLIC"}
                      onCheckedChange={(checked) =>
                        handleAttrChange(
                          index,
                          "visibility",
                          checked ? "PUBLIC" : "PRIVATE",
                        )
                      }
                    />
                    Publicly Visible
                  </Label>
                </div>
                {attr.visibility === "PRIVATE" && (
                  <div className="flex-1 border-l border-border/25 pl-4">
                    <span className="text-muted-foreground font-semibold block mb-1">
                      Visible to Entities:
                    </span>
                    {entityIds.length === 0 ? (
                      <span className="text-[10px] italic text-muted-foreground">
                        Add entities first to grant private access
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {entityIds.map((entId) => {
                          const isAllowed =
                            attr.allowedEntities?.includes(entId);
                          return (
                            <button
                              key={entId}
                              type="button"
                              onClick={() =>
                                handleToggleEntityAccess(index, entId)
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                                isAllowed
                                  ? "bg-primary/20 border-primary text-primary font-bold"
                                  : "bg-background border-border/30 text-muted-foreground hover:bg-secondary"
                              }`}
                            >
                              {entities
                                ? getEntityDisplayNameById(entId, entities)
                                : entId}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
