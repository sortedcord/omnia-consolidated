"use client";

import * as React from "react";
import { useState } from "react";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameSimulation } from "@/app/actions";

interface ManageViewProps {
  snapshot: SimSnapshot;
  onRename: (updated: SimSnapshot) => void;
}

export function ManageView({ snapshot, onRename }: ManageViewProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(snapshot.scenarioName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    setEditedName(snapshot.scenarioName);
  }, [snapshot.scenarioName]);

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await renameSimulation(snapshot.id, editedName.trim());
      if (res.ok) {
        onRename(res.snapshot);
        setIsEditingName(false);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rename simulation",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[800px] mx-auto space-y-6 pb-12">
        {/* Simulation Info */}
        <div className="border border-border/30 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
          <h3 className="text-headline-sm text-primary mb-4 border-b border-dotted border-border/20 pb-2">
            Simulation Info
          </h3>
          {error && (
            <div className="mb-4 border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-mono">
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2 md:col-span-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Simulation Name
              </span>
              {isEditingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 max-w-sm font-sans"
                    disabled={saving}
                  />
                  <Button size="sm" onClick={handleSaveName} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingName(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-foreground font-bold text-base font-head">
                    {snapshot.scenarioName}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      setEditedName(snapshot.scenarioName);
                      setIsEditingName(true);
                    }}
                  >
                    Rename
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Session ID
              </span>
              <span className="text-foreground font-bold break-all">
                {snapshot.id}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Max Turns
              </span>
              <span className="text-foreground font-bold font-mono">
                {snapshot.maxTurns}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Turn Count
              </span>
              <span className="text-foreground font-bold font-mono">
                {snapshot.turn}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Entities Registered
              </span>
              <span className="text-foreground font-bold font-mono">
                {snapshot.entities.length}
              </span>
            </div>
          </div>
        </div>

        {/* Entities Involved */}
        <div className="border border-border/30 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
          <h3 className="text-headline-sm text-primary mb-4 border-b border-dotted border-border/20 pb-2">
            Entities Involved
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {snapshot.entities.map((ent) => (
              <div
                key={ent.id}
                className="border border-border/20 bg-secondary/20 p-4 shadow-[1px_1px_0_0_var(--border)] flex justify-between items-center"
              >
                <div>
                  <strong className="text-sm text-foreground block font-head tracking-wide">
                    {ent.name}
                  </strong>
                  <span className="text-xs text-muted-foreground font-mono block mt-1">
                    ID: {ent.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ent.isPlayer ? (
                    <span className="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-xs font-mono">
                      PLAYER
                    </span>
                  ) : (
                    <span className="bg-secondary/60 text-muted-foreground border border-border/20 px-2 py-0.5 text-xs font-mono">
                      NPC
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
