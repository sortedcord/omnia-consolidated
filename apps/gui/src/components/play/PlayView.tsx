"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startSimulation,
  stepSimulation,
  submitPlayerAction,
  listSavedSimulations,
  resumeSimulation,
  getConfigStatus,
  getScenarioEntities,
  deleteSimulation,
  listProviderInstances,
} from "@/app/play/actions";
import type { SimSnapshot } from "@/lib/simulation-types";
import type { ModelProviderInstance } from "@omnia/llm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PromptModal } from "./PromptModal";

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
    <div className="rounded border-2 bg-card p-3">
      <div className="flex justify-between items-center mb-1.5 text-sm">
        <div className="flex items-center gap-2">
          <strong>{entry.entityName}</strong>
          <span className="text-muted-foreground">
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
      <div className="text-[0.9375rem] leading-relaxed mb-1.5">{entry.narrativeProse}</div>
      <div className="flex flex-col gap-1">
        {entry.intents.map((intent, i) => (
          <IntentTag key={i} intent={intent} isSelf={isPlayerCard} />
        ))}
      </div>
    </div>
  );
}

export function PlayView() {
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
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

  const [savedSessions, setSavedSessions] = useState<SimSnapshot[]>([]);

  const loadSavedSessions = useCallback(async () => {
    try {
      const res = await listSavedSimulations();
      if (res.ok) {
        setSavedSessions(res.sessions);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!snapshot) {
      loadSavedSessions();
    }
  }, [snapshot, loadSavedSessions]);

  const handleResume = async (id: string) => {
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
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this simulation session?")) return;
    setLoading(true);
    try {
      const res = await deleteSimulation(id);
      if (!res.ok) {
        setError(res.error);
      } else {
        await loadSavedSessions();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session.");
    } finally {
      setLoading(false);
    }
  };

  const [scenarios, setScenarios] = useState<{ path: string; name: string }[]>([]);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [availableEntities, setAvailableEntities] = useState<{ id: string; name: string }[]>([]);
  const [selectedEntity, setSelectedEntity] = useState("");

  const [providerInstances, setProviderInstances] = useState<ModelProviderInstance[]>([]);

  // Load scenarios and provider instances on mount
  useEffect(() => {
    async function loadScenariosAndProviders() {
      try {
        const configStatus = await getConfigStatus();
        setScenarios(configStatus.availableScenarios);
        if (configStatus.availableScenarios.length > 0) {
          setSelectedScenario(configStatus.availableScenarios[0].path);
        }
      } catch {
        // ignore
      }
      try {
        const providersList = await listProviderInstances();
        setProviderInstances(providersList);
      } catch {
        // ignore
      }
    }
    loadScenariosAndProviders();
  }, [snapshot]);

  // Fetch entities when selectedScenario changes
  useEffect(() => {
    if (!selectedScenario) {
      setAvailableEntities([]);
      setSelectedEntity("");
      return;
    }
    async function loadEntities() {
      try {
        const res = await getScenarioEntities(selectedScenario);
        if (res.ok) {
          setAvailableEntities(res.entities);
          if (res.entities.length > 0) {
            setSelectedEntity(res.entities[0].id);
          } else {
            setSelectedEntity("");
          }
        }
      } catch {
        // ignore
      }
    }
    loadEntities();
  }, [selectedScenario]);

  const handleStart = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const form = new FormData(e.currentTarget);
      const result = await startSimulation({
        scenario: (form.get("scenario") as string) || undefined,
        playEntity: (form.get("playEntity") as string) || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setSnapshot(result.snapshot);

      if (result.snapshot.status === "running") {
        await runSteps(result.snapshot.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start simulation.",
      );
      setLoading(false);
    }
  };

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

  return (
    <div className="mx-auto max-w-[800px] p-8 pt-4">
      <h1 className="text-2xl mb-4">Omnia Play</h1>

      {!snapshot && (
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-8 mt-4">
          <div className="rounded-xl border-2 bg-card p-6 shadow-sm">
            <h2 className="text-lg font-head font-medium mb-5 pb-2 border-b">Start New Simulation</h2>
            <form onSubmit={handleStart} className="flex flex-col gap-4">
              {error && (
                <div className="rounded border-2 border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label htmlFor="scenario" className="text-sm font-medium">Scenario</label>
                <select
                  id="scenario"
                  name="scenario"
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full rounded border-2 bg-input px-3 py-2 text-sm shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {scenarios.map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="playEntity" className="text-sm font-medium">
                  Play as (Entity)
                </label>
                <select
                  id="playEntity"
                  name="playEntity"
                  value={selectedEntity}
                  onChange={(e) => setSelectedEntity(e.target.value)}
                  disabled={availableEntities.length === 0}
                  className="w-full rounded border-2 bg-input px-3 py-2 text-sm shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                >
                  <option value="">-- Spectator (Observer) --</option>
                  {availableEntities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" disabled={loading || providerInstances.length === 0}>
                {loading ? "Starting..." : "Start Simulation"}
              </Button>
            </form>
          </div>

          <div className="rounded-xl border-2 bg-card p-6 shadow-sm">
            <h2 className="text-lg font-head font-medium mb-5 pb-2 border-b">Resume Simulation</h2>
            {savedSessions.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No saved sessions found. Start a new one!</p>
            ) : (
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                {savedSessions.map((s) => (
                  <div key={s.id} className="rounded border-2 bg-muted/50 p-3 flex justify-between items-center gap-4 transition-all hover:border-muted-foreground/30">
                    <div className="flex flex-col gap-0.5 text-sm">
                      <strong className="text-sm text-foreground">{s.scenarioName}</strong>
                      <span className="text-muted-foreground">
                        Turn {s.turn} &middot; {s.entities.length} entities &middot; {s.status}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        Session ID: <code>{s.id}</code>
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Button size="sm" onClick={() => handleResume(s.id)} disabled={loading || providerInstances.length === 0}>
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => handleDelete(s.id, e)}
                        disabled={loading}
                        title="Delete Session"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {snapshot && (
        <>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl">{snapshot.scenarioName}</h2>
              {snapshot.status !== "done" && snapshot.status !== "error" && (
                <div className="flex gap-2">
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
                      setSnapshot(null);
                      setError("");
                    }}
                  >
                    Stop
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{snapshot.scenarioDescription}</p>
            <p className="text-sm font-medium text-primary mt-1">
              {loading && "⏳ "}
              {statusMessage()}
            </p>
          </div>

          <div className="flex flex-col gap-3 mb-4 max-h-[55vh] overflow-y-auto rounded border-2 bg-muted/30 p-3">
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
              <div className="flex items-center gap-2 text-sm italic text-muted-foreground p-2">
                <Spinner />
                {statusText || "Processing..."}
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {snapshot.status === "waiting_player" && snapshot.waitingEntity && (
            <div className="rounded border-2 bg-muted/50 p-4">
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium">
                  <strong>
                    Your context as {snapshot.waitingEntity.name}
                  </strong>
                </summary>
                <pre className="text-xs whitespace-pre-wrap bg-muted p-2 rounded max-h-[200px] overflow-y-auto mt-2">
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
                setSnapshot(null);
                setError("");
              }}
              className="mt-4"
            >
              {snapshot.status === "error" ? "Try Again" : "New Simulation"}
            </Button>
          )}

          {error && !loading && (
            <div className="rounded border-2 border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive mt-4">
              {error}
            </div>
          )}

          {selectedEntryForModal && (
            <PromptModal
              entry={selectedEntryForModal}
              onClose={() => setSelectedEntryForModal(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
