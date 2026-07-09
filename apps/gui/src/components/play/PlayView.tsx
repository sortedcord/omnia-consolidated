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
} from "@/app/play/actions";
import type { SimSnapshot } from "@/lib/simulation-types";

function IntentTag({
  intent,
}: {
  intent: SimSnapshot["log"][number]["intents"][number];
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

  return (
    <span className="intent-tag">
      [{label}] &ldquo;{intent.description}&rdquo;{outcome}
      {intent.minutesToAdvance ? ` [+${intent.minutesToAdvance}min]` : ""}
    </span>
  );
}

function PromptModal({
  entry,
  onClose,
}: {
  entry: SimSnapshot["log"][number];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"actor" | "decoder">("actor");

  useEffect(() => {
    if (!entry.rawPrompt && entry.decoderPrompt) {
      setActiveTab("decoder");
    }
  }, [entry]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Raw Prompts & Token Usage ({entry.entityName})</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-tabs">
          <button
            className={activeTab === "actor" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("actor")}
            disabled={!entry.rawPrompt}
          >
            Actor Prompt {entry.usage ? "📊" : ""}
          </button>
          <button
            className={activeTab === "decoder" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("decoder")}
            disabled={!entry.decoderPrompt}
          >
            Intent Decoder {entry.decoderUsage ? "📊" : ""}
          </button>
        </div>

        <div className="modal-body">
          {activeTab === "actor" && entry.rawPrompt && (
            <div className="tab-pane">
              {entry.usage ? (
                <div className="usage-stats">
                  <strong>Token Usage:</strong>
                  <span>Input: <code>{entry.usage.inputTokens}</code></span> &middot;{" "}
                  <span>Output: <code>{entry.usage.outputTokens}</code></span> &middot;{" "}
                  <span>Total: <code>{entry.usage.totalTokens}</code></span>
                </div>
              ) : (
                <div className="usage-stats italic text-gray">
                  No LLM token usage (Player turn used fixed prose).
                </div>
              )}

              <div className="prompt-field">
                <h4>System Prompt</h4>
                <pre>{entry.rawPrompt.systemPrompt}</pre>
              </div>

              <div className="prompt-field">
                <h4>User Context</h4>
                <pre>{entry.rawPrompt.userContext}</pre>
              </div>
            </div>
          )}

          {activeTab === "decoder" && entry.decoderPrompt && (
            <div className="tab-pane">
              {entry.decoderUsage && (
                <div className="usage-stats">
                  <strong>Token Usage:</strong>
                  <span>Input: <code>{entry.decoderUsage.inputTokens}</code></span> &middot;{" "}
                  <span>Output: <code>{entry.decoderUsage.outputTokens}</code></span> &middot;{" "}
                  <span>Total: <code>{entry.decoderUsage.totalTokens}</code></span>
                </div>
              )}

              <div className="prompt-field">
                <h4>System Prompt</h4>
                <pre>{entry.decoderPrompt.systemPrompt}</pre>
              </div>

              <div className="prompt-field">
                <h4>User Context</h4>
                <pre>{entry.decoderPrompt.userContext}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogEntryCard({
  entry,
  onShowPrompt,
}: {
  entry: SimSnapshot["log"][number];
  onShowPrompt: (entry: SimSnapshot["log"][number]) => void;
}) {
  const showMenu = !!(entry.rawPrompt || entry.decoderPrompt);

  return (
    <div className="log-entry">
      <div className="log-header">
        <div className="log-header-left">
          <strong>{entry.entityName}</strong>
          <span className="log-meta">
            Turn {entry.turn} &middot;{" "}
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {showMenu && (
          <button
            className="menu-btn"
            onClick={() => onShowPrompt(entry)}
            title="View Raw Prompts & Token Usage"
          >
            ☰
          </button>
        )}
      </div>
      <div className="log-prose">{entry.narrativeProse}</div>
      <div className="log-intents">
        {entry.intents.map((intent, i) => (
          <IntentTag key={i} intent={intent} />
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

      try {
        let current = snapshot;
        while (true) {
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

  // Load scenarios on mount
  useEffect(() => {
    async function loadScenarios() {
      try {
        const configStatus = await getConfigStatus();
        setScenarios(configStatus.availableScenarios);
        if (configStatus.availableScenarios.length > 0) {
          setSelectedScenario(configStatus.availableScenarios[0].path);
        }
      } catch {
        // ignore
      }
    }
    loadScenarios();
  }, []);

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
    <div className="play-view">
      <h1>Omnia Play</h1>

      {!snapshot && (
        <div className="setup-container">
          <div className="setup-box">
            <h2>Start New Simulation</h2>
            <form onSubmit={handleStart} className="setup-form">
              {error && <div className="error-banner">{error}</div>}
              <div className="field">
                <label htmlFor="scenario">Scenario</label>
                <select
                  id="scenario"
                  name="scenario"
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                >
                  {scenarios.map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="playEntity">
                  Play as (Entity)
                </label>
                <select
                  id="playEntity"
                  name="playEntity"
                  value={selectedEntity}
                  onChange={(e) => setSelectedEntity(e.target.value)}
                  disabled={availableEntities.length === 0}
                >
                  <option value="">-- Spectator (Observer) --</option>
                  {availableEntities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? "Starting..." : "Start Simulation"}
              </button>
            </form>
          </div>

          <div className="setup-box">
            <h2>Resume Simulation</h2>
            {savedSessions.length === 0 ? (
              <p className="no-sessions">No saved sessions found. Start a new one!</p>
            ) : (
              <div className="saved-sessions-list">
                {savedSessions.map((s) => (
                  <div key={s.id} className="saved-session-card">
                    <div className="card-info">
                      <strong>{s.scenarioName}</strong>
                      <span className="card-meta">
                        Turn {s.turn} &middot; {s.entities.length} entities &middot; {s.status}
                      </span>
                      <span className="card-date">
                        Session ID: <code>{s.id}</code>
                      </span>
                    </div>
                    <div className="card-actions">
                      <button onClick={() => handleResume(s.id)} disabled={loading}>
                        Resume
                      </button>
                      <button
                        onClick={(e) => handleDelete(s.id, e)}
                        disabled={loading}
                        className="delete-btn"
                        title="Delete Session"
                      >
                        Delete
                      </button>
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
          <div className="sim-info">
            <div className="sim-info-header">
              <h2>{snapshot.scenarioName}</h2>
              {snapshot.status !== "done" && snapshot.status !== "error" && (
                <button
                  className="stop-btn"
                  onClick={() => {
                    setSnapshot(null);
                    setError("");
                  }}
                >
                  Stop
                </button>
              )}
            </div>
            <p>{snapshot.scenarioDescription}</p>
            <p className="status">
              {loading && "⏳ "}
              {statusMessage()}
            </p>
          </div>

          <div className="log-container">
            {snapshot.log.map((entry, i) => (
              <LogEntryCard
                key={i}
                entry={entry}
                onShowPrompt={setSelectedEntryForModal}
              />
            ))}
            {loading && (
              <div className="log-processing">
                <span className="spinner" />
                {statusText || "Processing..."}
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {snapshot.status === "waiting_player" && snapshot.waitingEntity && (
            <div className="player-prompt">
              <details>
                <summary>
                  <strong>
                    Your context as {snapshot.waitingEntity.name}
                  </strong>
                </summary>
                <pre className="prompt-context">
                  {snapshot.waitingEntity.userContext}
                </pre>
              </details>

              <form onSubmit={handleSubmitAction} className="player-input">
                <textarea
                  value={playerInput}
                  onChange={(e) => setPlayerInput(e.target.value)}
                  placeholder="Describe what your character does, says, or thinks..."
                  rows={3}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !playerInput.trim()}
                >
                  {loading ? "Processing..." : "Submit Action"}
                </button>
              </form>
            </div>
          )}

          {(snapshot.status === "done" || snapshot.status === "error") && (
            <button
              onClick={() => {
                setSnapshot(null);
                setError("");
              }}
              className="new-sim-btn"
            >
              {snapshot.status === "error" ? "Try Again" : "New Simulation"}
            </button>
          )}

          {error && !loading && (
            <div className="error-banner" style={{ marginTop: "1rem" }}>
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

      <style>{`
        .play-view {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        .play-view h1 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
        }

        .error-banner {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          border-radius: 4px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }

        .setup-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .field label {
          font-size: 0.875rem;
          font-weight: 500;
        }

        .field input,
        .field select {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 0.875rem;
          background: #fff;
        }

        button {
          padding: 0.5rem 1rem;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .stop-btn {
          background: #dc2626;
          font-size: 0.75rem;
          padding: 0.25rem 0.75rem;
        }

        .sim-info {
          margin-bottom: 1rem;
        }

        .sim-info-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }

        .sim-info h2 {
          font-size: 1.25rem;
        }

        .sim-info p {
          color: #555;
          font-size: 0.875rem;
        }

        .status {
          font-weight: 500;
          color: #2563eb;
          margin-top: 0.25rem;
        }

        .log-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
          max-height: 55vh;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.75rem;
          background: #fafafa;
        }

        .log-processing {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #888;
          font-size: 0.8125rem;
          font-style: italic;
          padding: 0.5rem;
        }

        .spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid #ddd;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .log-entry {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.75rem;
          background: #fff;
        }

        .log-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.375rem;
          font-size: 0.8125rem;
        }

        .log-meta {
          color: #888;
        }

        .log-prose {
          font-size: 0.9375rem;
          line-height: 1.5;
          margin-bottom: 0.375rem;
        }

        .log-intents {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .intent-tag {
          font-size: 0.8125rem;
          color: #555;
        }

        .player-prompt {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 1rem;
          background: #f9fafb;
        }

        .player-prompt details {
          margin-bottom: 0.75rem;
        }

        .player-prompt summary {
          cursor: pointer;
          font-size: 0.875rem;
        }

        .prompt-context {
          font-size: 0.75rem;
          white-space: pre-wrap;
          background: #f3f4f6;
          padding: 0.5rem;
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
          margin-top: 0.5rem;
        }

        .player-input {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .player-input textarea {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 0.875rem;
          font-family: inherit;
          resize: vertical;
        }

        .new-sim-btn {
          margin-top: 1rem;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(2px);
        }
        .modal-content {
          background: #fff;
          width: 90%;
          max-width: 750px;
          max-height: 85vh;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modalFadeIn 0.2s ease-out;
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1.1rem;
          color: #111;
        }
        .close-btn {
          background: transparent;
          border: none;
          color: #9ca3af;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .close-btn:hover {
          color: #4b5563;
        }
        .modal-tabs {
          display: flex;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        .tab-btn {
          flex: 1;
          background: transparent;
          color: #4b5563;
          border: none;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          padding: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tab-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .tab-btn:hover:not(:disabled) {
          background: #f3f4f6;
          color: #111;
        }
        .tab-btn.active {
          border-bottom-color: #2563eb;
          color: #2563eb;
          background: #fff;
        }
        .modal-body {
          padding: 1.25rem;
          overflow-y: auto;
          flex-grow: 1;
        }
        .tab-pane {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .usage-stats {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e3a8a;
          padding: 0.625rem 0.875rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .usage-stats code {
          background: rgba(37, 99, 235, 0.1);
          color: #1d4ed8;
          padding: 0.125rem 0.25rem;
          border-radius: 4px;
        }
        .prompt-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .prompt-field h4 {
          margin: 0;
          font-size: 0.875rem;
          color: #374151;
          font-weight: 600;
        }
        .prompt-field pre {
          margin: 0;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          line-height: 1.5;
          white-space: pre-wrap;
          font-family: monospace;
          max-height: 250px;
          overflow-y: auto;
          color: #1f2937;
        }
        .italic {
          font-style: italic;
        }
        .text-gray {
          color: #6b7280;
        }
        
        /* Menu Button Styles */
        .log-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .menu-btn {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          font-size: 1rem;
          line-height: 1;
          border-radius: 4px;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .menu-btn:hover {
          background: #f3f4f6;
          color: #4b5563;
        }
        .log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.375rem;
          font-size: 0.8125rem;
        }

        /* Two-Column Setup Styles */
        .setup-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
          margin-top: 1rem;
        }
        @media (min-width: 768px) {
          .setup-container {
            grid-template-columns: 1.2fr 1fr;
          }
        }
        .setup-box {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .setup-box h2 {
          font-size: 1.15rem;
          margin-bottom: 1.25rem;
          color: #111;
          border-bottom: 1px solid #f3f4f6;
          padding-bottom: 0.5rem;
        }
        .no-sessions {
          color: #6b7280;
          font-size: 0.875rem;
          font-style: italic;
        }
        .saved-sessions-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 0.25rem;
        }
        .saved-session-card {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          background: #f9fafb;
          transition: all 0.15s;
        }
        .saved-session-card:hover {
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .card-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          font-size: 0.8125rem;
        }
        .card-info strong {
          font-size: 0.875rem;
          color: #1f2937;
        }
        .card-meta {
          color: #4b5563;
        }
        .card-date {
          color: #9ca3af;
          font-size: 0.75rem;
        }
        .card-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .saved-session-card button {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
          background: #2563eb;
        }
        .saved-session-card button:hover {
          background: #1d4ed8;
        }
        .saved-session-card button.delete-btn {
          background: #ef4444;
        }
        .saved-session-card button.delete-btn:hover {
          background: #dc2626;
        }
      `}</style>
    </div>
  );
}
