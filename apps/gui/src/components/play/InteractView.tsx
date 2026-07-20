"use client";

import * as React from "react";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { hydrate } from "@omnia/voice";
import { Brain, PersonStanding, Speech } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { InteractDock } from "./InteractDock";

function IntentTag({
  intent,
  playerAliases,
  playerId,
  entities,
}: {
  intent: SimSnapshot["log"][number]["intents"][number];
  playerAliases: Record<string, string>;
  playerId: string;
  entities: SimSnapshot["entities"];
}) {
  const icons: Record<string, React.ReactNode> = {
    monologue: <Brain className="size-4" />,
    thought: <Brain className="size-4" />,
    dialogue: <Speech className="size-4" />,
    action: <PersonStanding className="size-4" />,
  };

  const icon = icons[intent.type] || null;

  const viewerAliasesMap = new Map<string, string>();
  if (entities) {
    for (const ent of entities) {
      viewerAliasesMap.set(ent.id, ent.name || ent.id);
    }
  }
  if (playerAliases) {
    for (const [targetId, alias] of Object.entries(playerAliases)) {
      viewerAliasesMap.set(targetId, alias);
    }
  }

  const viewerEntityMock = {
    id: playerId || "",
    aliases: viewerAliasesMap,
  };

  const textToDisplay = hydrate(
    intent.content,
    viewerEntityMock as unknown as Parameters<typeof hydrate>[1],
  );

  const modifiersStr =
    intent.modifiers && intent.modifiers.length > 0 ? (
      <span className="italic opacity-80 text-muted-foreground ml-1">
        ({intent.modifiers.join(", ")})
      </span>
    ) : null;

  const invalidActionReason =
    intent.type === "action" && !intent.isValid && intent.reason
      ? ` (${intent.reason})`
      : "";

  const invalidActionClassName =
    intent.type === "action" && !intent.isValid ? " text-destructive" : "";

  return (
    <>
      <span className="text-sm text-muted-foreground inline-flex items-start gap-1">
        <span className="mt-0.5 inline-flex shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className={invalidActionClassName}>
          &ldquo;{textToDisplay}&rdquo;{modifiersStr}
          {invalidActionReason}
          {intent.minutesToAdvance ? ` [+${intent.minutesToAdvance}min]` : ""}
        </span>
      </span>
      <br />
    </>
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
  playerAliases,
  playerId,
  entities,
}: {
  entry: SimSnapshot["log"][number];
  onShowPrompt: (entry: SimSnapshot["log"][number]) => void;
  isPlayerCard: boolean;
  playerAliases: Record<string, string>;
  playerId: string;
  entities: SimSnapshot["entities"];
}) {
  const showMenu = !!(entry.rawPrompt || entry.decoderPrompt);

  return (
    <div className={cn("mb-2")}>
      <div
        className={cn(
          "border p-4 shadow-sm",
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
      </div>
      <div className={cn("mt-3 ms-3")}>
        {entry.intents.map((intent, i) => (
          <IntentTag
            key={i}
            intent={intent}
            playerAliases={playerAliases}
            playerId={playerId}
            entities={entities}
          />
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
  onPauseRequested: () => void;
  onResumeRequested: () => void;
  onStopRequested: () => void;
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
  onPauseRequested,
  onResumeRequested,
  onStopRequested,
}: InteractViewProps) {
  const playerEntity = snapshot.entities.find((e) => e.isPlayer);

  return (
    <>
      {/* Scrollable Center Viewport */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-4 max-w-200 mx-auto pb-44 md:pb-52">
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
                      Memories were transferred from Cognitive Buffer to Memory
                      Ledger
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
            const playerAliases = playerEntity?.aliases || {};
            const playerId = playerEntity?.id || "";

            return (
              <LogEntryCard
                key={i}
                entry={entry}
                onShowPrompt={onShowPrompt}
                isPlayerCard={entry.entityId === playerEntity?.id}
                playerAliases={playerAliases}
                playerId={playerId}
                entities={snapshot.entities}
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

      <InteractDock
        snapshot={snapshot}
        loading={loading}
        playerInput={playerInput}
        setPlayerInput={setPlayerInput}
        onSubmitAction={onSubmitAction}
        onPauseRequested={onPauseRequested}
        onResumeRequested={onResumeRequested}
        onStopRequested={onStopRequested}
      />
    </>
  );
}
