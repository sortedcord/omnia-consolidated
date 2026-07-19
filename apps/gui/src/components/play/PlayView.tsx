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
import { Spinner } from "@/components/ui/spinner";
import { PromptModal } from "./PromptModal";
import { HandoffModal } from "./HandoffModal";
import { InteractView } from "./InteractView";
import { ManageView } from "./ManageView";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

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
  const [selectedHandoffForModal, setSelectedHandoffForModal] = useState<
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

          {activeTab === "interact" ? (
            <InteractView
              snapshot={snapshot}
              loading={loading}
              statusText={statusText}
              playerInput={playerInput}
              setPlayerInput={setPlayerInput}
              onSubmitAction={handleSubmitAction}
              onShowPrompt={setSelectedEntryForModal}
              onShowHandoff={setSelectedHandoffForModal}
              logEndRef={logEndRef}
            />
          ) : (
            <ManageView snapshot={snapshot} onRename={setSnapshot} />
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

        {selectedHandoffForModal && (
          <HandoffModal
            entry={selectedHandoffForModal}
            onClose={() => setSelectedHandoffForModal(null)}
          />
        )}
      </div>
    </SidebarProvider>
  );
}
