"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  stepSimulation,
  submitPlayerAction,
  resumeSimulation,
} from "@/app/play/actions";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PromptModal } from "./PromptModal";
import { cn } from "@/lib/utils";

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

  const textToDisplay = (isSelf && intent.selfDescription)
    ? intent.selfDescription
    : intent.description;

  const modifiersStr = intent.modifiers && intent.modifiers.length > 0 ? (
    <span className="italic opacity-80 text-muted-foreground ml-1">
      ({intent.modifiers.join(", ")})
    </span>
  ) : null;

  return (
    <span className="text-sm text-muted-foreground">
      [{label}] &ldquo;{textToDisplay}&rdquo;{modifiersStr}{outcome}
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
    <div className={cn(
      "border p-4 shadow-[2px_2px_0_0_var(--border)]",
      isPlayerCard 
        ? "border-primary bg-surface-container-low" 
        : "border-border/30 bg-card"
    )}>
      <div className="flex justify-between items-center mb-2 border-b border-dotted border-border/20 pb-2">
        <div className="flex items-center gap-2">
          <strong className="text-body-md font-bold text-foreground">{entry.entityName}</strong>
          <span className="text-xs text-muted-foreground font-mono">
            Turn {entry.turn} &middot;{" "}
            {formatSimTime(entry.timestamp)}
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
      <div className="text-body-md leading-relaxed mb-3 text-foreground/90 whitespace-pre-wrap">{entry.narrativeProse}</div>
      <div className="flex flex-col gap-1.5 mt-2 border-t border-dotted border-border/10 pt-2">
        {entry.intents.map((intent, i) => (
          <IntentTag key={i} intent={intent} isSelf={isPlayerCard} />
        ))}
      </div>
    </div>
  );
}

export function PlayView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const simId = searchParams.get("simId");

  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerInput, setPlayerInput] = useState("");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [selectedEntryForModal, setSelectedEntryForModal] = useState<SimSnapshot["log"][number] | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const steppingRef = useRef(false);
  const pauseRequestedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => logEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [snapshot, scrollToBottom]);

  const runSteps = useCallback(
    async (id: string) => {
      if (steppingRef.current) return;
      steppingRef.current = true;
      setLoading(true);
      setError("");
      pauseRequestedRef.current = false;

      try {
        let current = snapshot;
        while (true) {
          if (pauseRequestedRef.current) {
            break;
          }
          const result = await stepSimulation({ simId: id });
          if (!result.ok) {
            setError(result.error);
            break;
          }
          current = result.snapshot;
          setSnapshot(current);

          if (
            current.status === "waiting_player" ||
            current.status === "done" ||
            current.status === "error"
          ) {
            break;
          }

          const entityName =
            current.entities[current.entityIndex ?? 0]?.name || "";
          setStatusText(
            `Turn ${current.turn} — processing ${entityName || "next step"}...`,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed during simulation step.",
        );
      } finally {
        steppingRef.current = false;
        setLoading(false);
        setStatusText("");
      }
    },
    [snapshot],
  );

  const handleResume = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await resumeSimulation(id);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setSnapshot(res.snapshot);
      if (res.snapshot.status === "running") {
        await runSteps(res.snapshot.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume session.");
      setLoading(false);
    }
  }, [runSteps]);

  // Load simulation on mount
  useEffect(() => {
    if (!simId) {
      router.replace("/");
      return;
    }
    handleResume(simId);
  }, [simId, handleResume, router]);

  const handleSubmitAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!snapshot || !playerInput.trim()) return;

    setLoading(true);
    const prose = playerInput.trim();
    setPlayerInput("");

    try {
      const result = await submitPlayerAction({
        simId: snapshot.id,
        prose,
      });

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setSnapshot(result.snapshot);

      if (result.snapshot.status === "running") {
        await runSteps(result.snapshot.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit action.",
      );
      setLoading(false);
    }
  };

  const statusMessage = () => {
    if (!snapshot) return null;
    if (loading && statusText) return statusText;
    switch (snapshot.status) {
      case "waiting_player":
        return `Waiting for your input as "${snapshot.waitingEntity?.name}"...`;
      case "done":
        return "Simulation complete.";
      case "error":
        return `Error: ${snapshot.error}`;
      default:
        return "Simulation running...";
    }
  };

  if (!snapshot && loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Spinner />
        <span className="text-sm text-muted-foreground font-mono">Initializing simulation...</span>
      </div>
    );
  }

  if (!snapshot && error) {
    return (
      <div className="mx-auto max-w-[800px] px-10 py-12">
        <div className="border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
          {error}
        </div>
        <Button onClick={() => router.push("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="mx-auto max-w-[800px] px-10 py-12 animate-fade-in">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-headline-md text-primary">{snapshot.scenarioName}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pauseRequestedRef.current = true;
                router.push("/");
              }}
            >
              Dashboard
            </Button>
            {snapshot.status !== "done" && snapshot.status !== "error" && (
              <>
                {snapshot.status === "running" && (
                  loading ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        pauseRequestedRef.current = true;
                      }}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => runSteps(snapshot.id)}
                    >
                      Resume
                    </Button>
                  )
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    pauseRequestedRef.current = true;
                    router.push("/");
                  }}
                >
                  Stop
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{snapshot.scenarioDescription}</p>
        <p className="text-sm font-medium text-primary mt-1">
          {loading && "⏳ "}
          {statusMessage()}
        </p>
      </div>

      <div className="flex flex-col gap-4 mb-6 max-h-[55vh] overflow-y-auto border border-border/20 bg-secondary/30 p-4 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.05)]">
        {(() => {
          const playerEntity = snapshot.entities.find((e) => e.isPlayer);
          return snapshot.log.map((entry, i) => (
            <LogEntryCard
              key={i}
              entry={entry}
              onShowPrompt={setSelectedEntryForModal}
              isPlayerCard={entry.entityId === playerEntity?.id}
            />
          ));
        })()}
        {loading && (
          <div className="flex items-center gap-2 text-sm italic text-muted-foreground p-2 font-mono">
            <Spinner />
            {statusText || "Processing..."}
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {snapshot.status === "waiting_player" && snapshot.waitingEntity && (
        <div className="border border-border/30 bg-card p-4 shadow-[2px_2px_0_0_var(--border)]">
          <details className="mb-3">
            <summary className="cursor-pointer text-sm font-medium font-head text-primary">
              <strong>
                Your context as {snapshot.waitingEntity.name}
              </strong>
            </summary>
            <pre className="text-xs whitespace-pre-wrap bg-input border border-border/20 p-2 max-h-[200px] overflow-y-auto mt-2 font-mono">
              {snapshot.waitingEntity.userContext}
            </pre>
          </details>

          <form onSubmit={handleSubmitAction} className="flex flex-col gap-2">
            <Textarea
              value={playerInput}
              onChange={(e) => setPlayerInput(e.target.value)}
              placeholder="Describe what your character does, says, or thinks..."
              rows={3}
              disabled={loading}
            />
            <Button
              type="submit"
              disabled={loading || !playerInput.trim()}
            >
              {loading ? "Processing..." : "Submit Action"}
            </Button>
          </form>
        </div>
      )}

      {(snapshot.status === "done" || snapshot.status === "error") && (
        <Button
          onClick={() => {
            router.push("/");
          }}
          className="mt-4"
        >
          {snapshot.status === "error" ? "Back to Dashboard" : "New Simulation"}
        </Button>
      )}

      {error && !loading && (
        <div className="border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive mt-4">
          {error}
        </div>
      )}

      {selectedEntryForModal && (
        <PromptModal
          entry={selectedEntryForModal}
          onClose={() => setSelectedEntryForModal(null)}
        />
      )}
    </div>
  );
}
