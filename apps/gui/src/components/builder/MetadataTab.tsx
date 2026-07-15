"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AttributeEditor } from "./AttributeEditor";
import type { AttributeData } from "./types";

interface MetadataTabProps {
  scenarioId: string;
  setScenarioId: (val: string) => void;
  name: string;
  setName: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  startTime: string;
  setStartTime: (val: string) => void;
  worldAttributes: AttributeData[];
  setWorldAttributes: (attrs: AttributeData[]) => void;
  entityIds: string[];
}

export function MetadataTab({
  scenarioId,
  setScenarioId,
  name,
  setName,
  description,
  setDescription,
  startTime,
  setStartTime,
  worldAttributes,
  setWorldAttributes,
  entityIds,
}: MetadataTabProps) {
  const addWorldAttribute = () => {
    setWorldAttributes([
      ...worldAttributes,
      { name: "", value: "", visibility: "PUBLIC", allowedEntities: [] },
    ]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Basic Fields */}
      <div className="lg:col-span-2 space-y-5 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
        <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">
          Scenario Metadata
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-id">Scenario Template ID</Label>
            <Input
              id="sc-id"
              placeholder="e.g. my-custom-scenario"
              value={scenarioId}
              onChange={(e) =>
                setScenarioId(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "")
                )
              }
              className="font-mono text-xs"
            />
            <span className="text-[10px] text-muted-foreground">
              Unique filename ID. Alphanumeric, hyphens and underscores only.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sc-start">Start Time (ISO Date)</Label>
            <Input
              id="sc-start"
              placeholder="e.g. 2026-07-06T12:00:00.000Z"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="font-mono text-xs"
            />
            <span className="text-[10px] text-muted-foreground">
              Global clock starting timestamp.
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sc-name">Scenario Name</Label>
          <Input
            id="sc-name"
            placeholder="e.g. The Quiet Tavern"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sc-desc">Description</Label>
          <Textarea
            id="sc-desc"
            placeholder="Describe the starting setup..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs h-24"
          />
        </div>
      </div>

      {/* World level Attributes */}
      <div className="border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
        <AttributeEditor
          title="World Attributes"
          attributes={worldAttributes}
          onChange={setWorldAttributes}
          onAdd={addWorldAttribute}
          entityIds={entityIds}
        />
      </div>
    </div>
  );
}
