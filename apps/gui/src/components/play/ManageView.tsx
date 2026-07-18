"use client";

import * as React from "react";
import type { SimSnapshot } from "@/lib/simulation-types";

interface ManageViewProps {
  snapshot: SimSnapshot;
}

export function ManageView({ snapshot }: ManageViewProps) {
  return (
    <main className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[800px] mx-auto space-y-6 pb-12">
        {/* Simulation Info */}
        <div className="border border-border/30 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
          <h3 className="text-headline-sm text-primary mb-4 border-b border-dotted border-border/20 pb-2">
            Simulation Info
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-mono">
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
              <span className="text-foreground font-bold">
                {snapshot.maxTurns}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Turn Count
              </span>
              <span className="text-foreground font-bold">{snapshot.turn}</span>
            </div>
            <div className="flex flex-col gap-1 border-b border-border/10 pb-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Entities Registered
              </span>
              <span className="text-foreground font-bold">
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
