"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  stepSimulation,
  submitPlayerAction,
  resumeSimulation,
} from "@/app/actions";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PromptModal } from "./PromptModal";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

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
function MobileSidebarClose() {
  const { isMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <div className="flex justify-between items-center px-6 py-4 border-b border-border/10">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
        Menu
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpenMobile(false)}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
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
  const [selectedEntryForModal, setSelectedEntryForModal] = useState<
    SimSnapshot["log"][number] | null
  >(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const steppingRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const snapshotRef = useRef<SimSnapshot | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => logEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [snapshot, scrollToBottom]);

  const runSteps = useCallback(async (id: string) => {
    if (steppingRef.current) return;
    steppingRef.current = true;
    setLoading(true);
    setError("");
    pauseRequestedRef.current = false;

    try {
      let current = snapshotRef.current;
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
        err instanceof Error ? err.message : "Failed during simulation step.",
      );
    } finally {
      steppingRef.current = false;
      setLoading(false);
      setStatusText("");
    }
  }, []);

  const handleResume = useCallback(
    async (id: string) => {
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
        const hasPlayer = res.snapshot.entities.some((e) => e.isPlayer);
        if (res.snapshot.status === "running" && hasPlayer) {
          await runSteps(res.snapshot.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to resume session.",
        );
        setLoading(false);
      }
    },
    [runSteps],
  );

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
      setError(err instanceof Error ? err.message : "Failed to submit action.");
      setLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<"interact" | "manage">("interact");

  const statusMessage = () => {
    if (!snapshot) return null;
    if (loading && statusText) return statusText;
    switch (snapshot.status) {
      case "waiting_player":
        return `Waiting for your input as "${snapshot.waitingEntity?.name}"...`;
      case "error":
        return `Error: ${snapshot.error}`;
      default:
        return null;
    }
  };

  const getUnifiedStatus = () => {
    if (!snapshot) return "";
    switch (snapshot.status) {
      case "running":
        return loading ? "RUNNING" : "PAUSED";
      case "waiting_player":
        return "WAITING FOR INPUT";
      case "done":
        return "COMPLETE";
      case "error":
        return "ERROR";
      default:
        return (snapshot.status as string).toUpperCase();
    }
  };

  if (!snapshot && loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Spinner />
        <span className="text-sm text-muted-foreground font-mono">
          Initializing simulation...
        </span>
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
    <SidebarProvider>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar className="border-r border-border/30 bg-card shrink-0">
          <SidebarContent className="flex flex-col justify-between h-full bg-card">
            <MobileSidebarClose />
            <div className="p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono mb-4">
                Simulation
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setActiveTab("interact")}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm font-medium border transition-all duration-100",
                    activeTab === "interact"
                      ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)]"
                      : "border-border/30 hover:bg-secondary text-foreground",
                  )}
                >
                  Interact
                </button>
                <button
                  onClick={() => setActiveTab("manage")}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm font-medium border transition-all duration-100",
                    activeTab === "manage"
                      ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)]"
                      : "border-border/30 hover:bg-secondary text-foreground",
                  )}
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-dotted border-border/20">
              <Button
                variant="outline"
                className="w-full text-xs font-mono"
                onClick={() => {
                  pauseRequestedRef.current = true;
                  router.push("/");
                }}
              >
                ← Back to Home
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          {/* Sticky Header */}
          <header className="sticky top-0 bg-background/95 backdrop-blur-xs border-b border-dotted border-border/20 px-8 py-5 z-10 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="md:hidden" />
                <div>
                  <h2 className="text-headline-md text-primary font-head tracking-wide">
                    {snapshot.scenarioName}
                  </h2>
                  <p className="text-sm text-muted-foreground/90 mt-1 max-w-[550px]">
                    {snapshot.scenarioDescription}
                  </p>
                </div>
              </div>
              {/* Simulation Global Controls */}
              <div className="flex gap-2 shrink-0">
                {snapshot.status !== "done" && snapshot.status !== "error" && (
                  <>
                    {snapshot.status === "running" &&
                      (loading ? (
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
                      ))}
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
            <div className="flex items-center justify-between text-xs font-mono mt-1 pt-1.5 border-t border-border/10">
              <span className="text-muted-foreground">
                Status:{" "}
                <span className="text-primary font-bold">
                  {getUnifiedStatus()}
                </span>
              </span>
              <span className="text-muted-foreground">
                Turn:{" "}
                <span className="text-foreground font-bold">
                  {snapshot.turn}
                </span>
              </span>
            </div>
            {statusMessage() && (
              <p className="text-xs font-medium text-primary mt-1 font-mono">
                {loading && "⏳ "}
                {statusMessage()}
              </p>
            )}
          </header>

          {/* Scrollable Center Viewport */}
          <main className="flex-1 overflow-y-auto px-8 py-6">
            {activeTab === "interact" ? (
              <div className="flex flex-col gap-4 max-w-[800px] mx-auto pb-12">
                {(() => {
                  const playerEntity = snapshot.entities.find(
                    (e) => e.isPlayer,
                  );
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
            ) : (
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
                      <span className="text-foreground font-bold">
                        {snapshot.turn}
                      </span>
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
            )}
          </main>

          {/* Sticky Chat / Interaction Input Footer */}
          {activeTab === "interact" && (
            <footer className="sticky bottom-0 bg-background/95 backdrop-blur-xs border-t border-dotted border-border/20 px-8 py-4 z-10 shrink-0">
              <div className="max-w-[800px] mx-auto">
                {snapshot.status === "waiting_player" &&
                snapshot.waitingEntity ? (
                  <div className="border border-border/30 bg-card p-4 shadow-[2px_2px_0_0_var(--border)]">
                    <details className="mb-3">
                      <summary className="cursor-pointer text-sm font-medium font-head text-primary select-none outline-none">
                        <strong>
                          Your context as {snapshot.waitingEntity.name}
                        </strong>
                      </summary>
                      <pre className="text-xs whitespace-pre-wrap bg-input border border-border/20 p-2 max-h-[150px] overflow-y-auto mt-2 font-mono">
                        {snapshot.waitingEntity.userContext}
                      </pre>
                    </details>

                    <form
                      onSubmit={handleSubmitAction}
                      className="flex flex-col gap-2"
                    >
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
                ) : snapshot.status === "done" ||
                  snapshot.status === "error" ? (
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
          )}
        </div>

        {error && !loading && (
          <div className="fixed bottom-4 right-4 z-50 border border-destructive bg-destructive/90 text-destructive-foreground px-4 py-3 shadow-[3px_3px_0_0_var(--border)] text-sm">
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
    </SidebarProvider>
  );
}
