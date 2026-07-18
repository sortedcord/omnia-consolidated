"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

function IntentTag({
  intent,
  isSelf,
}: {
  intent: SimSnapshot["log"][number]["intents"][number];
  isSelf?: boolean;
}) {
  const labels: Record<string, string> = {
    monologue: "thought",
    dialogue: "dialogue",
    action: "action",
  };

  const label = labels[intent.type] || intent.type;

  let outcome = "";
  if (intent.type === "action") {
    outcome = intent.isValid ? " ✅" : ` ❌ (${intent.reason})`;
  }

  const textToDisplay =
    isSelf && intent.selfDescription
      ? intent.selfDescription
      : intent.description;

  const modifiersStr =
    intent.modifiers && intent.modifiers.length > 0 ? (
      <span className="italic opacity-80 text-muted-foreground ml-1">
        ({intent.modifiers.join(", ")})
      </span>
    ) : null;

  return (
    <span className="text-sm text-muted-foreground">
      [{label}] &ldquo;{textToDisplay}&rdquo;{modifiersStr}
      {outcome}
      {intent.minutesToAdvance ? ` [+${intent.minutesToAdvance}min]` : ""}
    </span>
  );
}

function formatSimTime(isoString: string) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC`;
  } catch {
    return isoString;
  }
}

function LogEntryCard({
  entry,
  onShowPrompt,
  isPlayerCard,
}: {
  entry: SimSnapshot["log"][number];
  onShowPrompt: (entry: SimSnapshot["log"][number]) => void;
  isPlayerCard: boolean;
}) {
  const showMenu = !!(entry.rawPrompt || entry.decoderPrompt);

  return (
    <div
      className={cn(
        "border p-4 shadow-[2px_2px_0_0_var(--border)]",
        isPlayerCard
          ? "border-primary bg-surface-container-low"
          : "border-border/30 bg-card",
      )}
    >
      <div className="flex justify-between items-center mb-2 border-b border-dotted border-border/20 pb-2">
        <div className="flex items-center gap-2">
          <strong className="text-body-md font-bold text-foreground">
            {entry.entityName}
          </strong>
          <span className="text-xs text-muted-foreground font-mono">
            Turn {entry.turn} &middot; {formatSimTime(entry.timestamp)}
          </span>
        </div>
        {showMenu && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onShowPrompt(entry)}
            title="View Raw Prompts & Token Usage"
          >
            ☰
          </Button>
        )}
      </div>
      <div className="text-body-md leading-relaxed mb-3 text-foreground/90 whitespace-pre-wrap">
        {entry.narrativeProse}
      </div>
      <div className="flex flex-col gap-1.5 mt-2 border-t border-dotted border-border/10 pt-2">
        {entry.intents.map((intent, i) => (
          <IntentTag key={i} intent={intent} isSelf={isPlayerCard} />
        ))}
      </div>
    </div>
  );
}

interface InteractViewProps {
  snapshot: SimSnapshot;
  loading: boolean;
  statusText: string;
  playerInput: string;
  setPlayerInput: (value: string) => void;
  onSubmitAction: (e: React.FormEvent<HTMLFormElement>) => void;
  onShowPrompt: (entry: SimSnapshot["log"][number]) => void;
  onShowHandoff: (entry: SimSnapshot["log"][number]) => void;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function InteractView({
  snapshot,
  loading,
  statusText,
  playerInput,
  setPlayerInput,
  onSubmitAction,
  onShowPrompt,
  onShowHandoff,
  logEndRef,
}: InteractViewProps) {
  const router = useRouter();

  const playerEntity = snapshot.entities.find((e) => e.isPlayer);

  return (
    <>
      {/* Scrollable Center Viewport */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-4 max-w-[800px] mx-auto pb-12">
          {snapshot.log.map((entry, i) => {
            if (entry.isHandoff) {
              return (
                <Alert
                  key={i}
                  className="max-w-md border-dashed bg-secondary/10"
                >
                  <div className="flex-1">
                    <AlertTitle>
                      Handoff triggered for {entry.entityName}
                    </AlertTitle>
                    <AlertDescription>
                      Memories were transferred from Buffer to Memory Ledger
                    </AlertDescription>
                  </div>
                  <AlertAction>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => onShowHandoff(entry)}
                    >
                      View Details
                    </Button>
                  </AlertAction>
                </Alert>
              );
            }
            return (
              <LogEntryCard
                key={i}
                entry={entry}
                onShowPrompt={onShowPrompt}
                isPlayerCard={entry.entityId === playerEntity?.id}
              />
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-sm italic text-muted-foreground p-2 font-mono">
              <Spinner />
              {statusText || "Processing..."}
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </main>

      {/* Sticky Chat / Interaction Input Footer */}
      <footer className="sticky bottom-0 bg-background/95 backdrop-blur-xs border-t border-dotted border-border/20 px-8 py-4 z-10 shrink-0">
        <div className="max-w-[800px] mx-auto">
          {snapshot.status === "waiting_player" && snapshot.waitingEntity ? (
            <div className="border border-border/30 bg-card p-4 shadow-[2px_2px_0_0_var(--border)]">
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium font-head text-primary select-none outline-none">
                  <strong>Your context as {snapshot.waitingEntity.name}</strong>
                </summary>
                <pre className="text-xs whitespace-pre-wrap bg-input border border-border/20 p-2 max-h-[150px] overflow-y-auto mt-2 font-mono">
                  {snapshot.waitingEntity.userContext}
                </pre>
              </details>

              <form onSubmit={onSubmitAction} className="flex flex-col gap-2">
                <Textarea
                  value={playerInput}
                  onChange={(e) => setPlayerInput(e.target.value)}
                  placeholder="Describe what your character does, says, or thinks..."
                  rows={3}
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || !playerInput.trim()}>
                  {loading ? "Processing..." : "Submit Action"}
                </Button>
              </form>
            </div>
          ) : snapshot.status === "done" || snapshot.status === "error" ? (
            <div className="flex justify-between items-center bg-card border border-border/30 p-4 shadow-[2px_2px_0_0_var(--border)]">
              <span className="text-sm font-mono text-muted-foreground">
                {snapshot.status === "error"
                  ? "Simulation finished with an error."
                  : "Simulation complete."}
              </span>
              <Button
                onClick={() => {
                  router.push("/");
                }}
                size="sm"
              >
                {snapshot.status === "error"
                  ? "Back to Dashboard"
                  : "New Simulation"}
              </Button>
            </div>
          ) : null}
        </div>
      </footer>
    </>
  );
}
