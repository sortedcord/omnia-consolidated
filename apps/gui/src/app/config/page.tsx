"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getConfigStatus,
  listProviderInstances,
  createProviderInstance,
  deleteProviderInstance,
  setActiveProviderInstance,
  getProviderMappings,
  setProviderMapping,
  updateProviderInstance,
  getAvailableProviders,
} from "@/app/play/actions";
import type { LLMProviderInstance, LLMProviderMeta } from "@omnia/llm";

interface ConfigStatus {
  apiKeySet: boolean;
  apiKeyPreview: string;
  model: string;
  availableScenarios: { path: string; name: string }[];
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [instances, setInstances] = useState<LLMProviderInstance[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [availableProviders, setAvailableProviders] = useState<LLMProviderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | "new">("new");
  const [editName, setEditName] = useState("");
  const [editProvider, setEditProvider] = useState("google-genai");
  const [editKey, setEditKey] = useState("");
  const [editModel, setEditModel] = useState("gemini-2.5-flash");
  const [editIsActive, setEditIsActive] = useState(false);

  useEffect(() => {
    if (selectedInstanceId === "new") {
      setEditName("");
      const defaultProvider = "google-genai";
      setEditProvider(defaultProvider);
      setEditKey("");
      const pMeta = availableProviders.find((p) => p.id === defaultProvider);
      setEditModel(pMeta?.defaultModel || "gemini-2.5-flash");
      setEditIsActive(false);
    } else {
      const inst = instances.find((i) => i.id === selectedInstanceId);
      if (inst) {
        setEditName(inst.name);
        setEditProvider(inst.providerName);
        setEditKey("");
        const pMeta = availableProviders.find((p) => p.id === inst.providerName);
        setEditModel(inst.modelName || pMeta?.defaultModel || "gemini-2.5-flash");
        setEditIsActive(inst.isActive);
      }
    }
  }, [selectedInstanceId, instances, availableProviders]);

  const handleProviderChange = (providerId: string) => {
    setEditProvider(providerId);
    const pMeta = availableProviders.find((p) => p.id === providerId);
    if (pMeta) {
      setEditModel(pMeta.defaultModel);
    }
  };

  const loadInstances = useCallback(async () => {
    try {
      const list = await listProviderInstances();
      setInstances(list);
    } catch {
      // ignore
    }
  }, []);

  const loadMappings = useCallback(async () => {
    try {
      const maps = await getProviderMappings();
      setMappings(maps);
    } catch {
      // ignore
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getConfigStatus();
      setConfig(result);
      await loadInstances();
      await loadMappings();
      const provs = await getAvailableProviders();
      setAvailableProviders(provs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadInstances, loadMappings]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setError("Name is required.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (selectedInstanceId === "new") {
        if (!editKey.trim()) {
          setError("API Key is required for new instances.");
          setLoading(false);
          return;
        }
        const created = await createProviderInstance(editName, editProvider, editKey, editModel || undefined);
        if (editIsActive) {
          await setActiveProviderInstance(created.id);
        }
        setSelectedInstanceId(created.id);
      } else {
        await updateProviderInstance(selectedInstanceId, editName, editProvider, editKey || undefined, editModel || undefined);
        if (editIsActive) {
          await setActiveProviderInstance(selectedInstanceId);
        }
      }

      await loadInstances();
      await loadMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (selectedInstanceId === "new") return;
    if (!confirm("Are you sure you want to delete this provider instance?")) return;

    try {
      setLoading(true);
      setError("");
      await deleteProviderInstance(selectedInstanceId);
      setSelectedInstanceId("new");
      await loadInstances();
      await loadMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMapping = async (task: string, providerInstanceId: string) => {
    try {
      setLoading(true);
      await setProviderMapping(task, providerInstanceId);
      await loadMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="config-page">
      <h1>Configuration</h1>

      {loading && <p>Loading configuration...</p>}
      {error && <div className="error-banner">{error}</div>}

      {config && !loading && (
        <>
          <section className="config-section">
            <h2>LLM Provider Instances</h2>
            <div className="provider-split-container">
              
              {/* 30% area */}
              <div className="provider-list-pane">
                <div className="pane-header">
                  <h3>Instances</h3>
                  <button
                    onClick={() => setSelectedInstanceId("new")}
                    className="btn-add-inst"
                    type="button"
                  >
                    + Add
                  </button>
                </div>
                <div className="pane-list">
                  {instances.length === 0 ? (
                    <div className="no-instances-msg">No instances configured</div>
                  ) : (
                    instances.map((inst) => (
                      <div
                        key={inst.id}
                        onClick={() => setSelectedInstanceId(inst.id)}
                        className={`instance-list-item ${selectedInstanceId === inst.id ? "active" : ""}`}
                      >
                        <div className="item-name">{inst.name}</div>
                        <div className="item-meta">
                          <span>{inst.providerName}</span>
                          {inst.isActive && <span className="active-pill">Active</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 70% area */}
              <div className="provider-form-pane">
                <form onSubmit={handleSave} className="provider-config-form">
                  <div className="form-scroll-content">
                    <h3>
                      {selectedInstanceId === "new"
                        ? "Create New Provider Instance"
                        : `Configure: ${editName}`}
                    </h3>

                    <div className="form-group">
                      <label htmlFor="formName">Friendly Name</label>
                      <input
                        id="formName"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g. Gemini - Production"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="formProvider">Provider Type</label>
                      <select
                        id="formProvider"
                        value={editProvider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                      >
                        {availableProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                      {editProvider && availableProviders.length > 0 && (
                        <span className="config-hint" style={{ marginTop: "0.25rem", background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#4b5563" }}>
                          {availableProviders.find((p) => p.id === editProvider)?.description}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="formKey">API Key</label>
                      <input
                        id="formKey"
                        type="password"
                        value={editKey}
                        onChange={(e) => setEditKey(e.target.value)}
                        placeholder={
                          selectedInstanceId === "new"
                            ? "AIzaSy..."
                            : "•••••••• (unchanged)"
                        }
                        required={selectedInstanceId === "new"}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="formModel">Model Name</label>
                      <input
                        id="formModel"
                        type="text"
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        placeholder="e.g. gemini-2.5-flash, gemini-2.5-pro"
                      />
                    </div>

                    <div className="form-group checkbox-group">
                      <input
                        id="formActive"
                        type="checkbox"
                        checked={editIsActive}
                        onChange={(e) => setEditIsActive(e.target.checked)}
                      />
                      <label htmlFor="formActive">Set as Active Instance</label>
                    </div>
                  </div>

                  <div className="form-actions-bar">
                    <div className="action-left">
                      {selectedInstanceId !== "new" && (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={loading}
                          className="btn-delete-pane"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="action-right">
                      <button type="submit" disabled={loading} className="btn-save-pane">
                        {loading ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

            </div>
          </section>

          <section className="config-section">
            <h2>Task Provider Routing</h2>
            <p className="config-hint" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", margin: "1rem 0" }}>
              Configure which LLM Provider Key Instance should handle each specific simulation task. Mappings default to the currently <strong>Active</strong> instance if not specified.
            </p>
            <div className="mappings-grid">
              {[
                { key: "actor-prose", label: "Actor Prose Generation", desc: "Generates roleplay/narrative prose for Non-Player Characters." },
                { key: "llm-validator", label: "LLM Validator", desc: "Arbitrates and validates proposed actions against the world state rules." },
                { key: "intent-decoder", label: "Intent Decoder", desc: "Splits raw prose actions into structured intents (Player and NPC)." },
                { key: "timedelta", label: "TimeDelta Generator", desc: "Calculates the duration of character actions to advance the game clock." },
              ].map((task) => (
                <div key={task.key} className="mapping-card">
                  <div className="mapping-info">
                    <strong>{task.label}</strong>
                    <span className="text-gray" style={{ fontSize: "0.75rem", marginTop: "0.125rem" }}>{task.desc}</span>
                  </div>
                  <select
                    value={mappings[task.key] || ""}
                    onChange={(e) => handleUpdateMapping(task.key, e.target.value)}
                  >
                    <option value="">-- Use Active Key (Default) --</option>
                    {instances.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} ({inst.providerName}){inst.isActive ? " [Active]" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="config-section">
            <h2>Environment Variables Default</h2>
            <div className="config-row">
              <span className="config-label">Default Model</span>
              <span className="config-value">
                <code>{config.model}</code>
              </span>
            </div>
            <div className="config-row">
              <span className="config-label">Default API Key (.env)</span>
              <span
                className={
                  config.apiKeySet
                    ? "config-value status-ok"
                    : "config-value status-error"
                }
              >
                {config.apiKeySet
                  ? `✓ Set (${config.apiKeyPreview})`
                  : "✗ NOT SET"}
              </span>
            </div>
          </section>

          <section className="config-section">
            <h2>Available Scenarios</h2>
            {config.availableScenarios.length === 0 ? (
              <p className="config-hint">
                No scenarios found in <code>content/demo/scenarios/</code>.
              </p>
            ) : (
              <table className="scenario-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {config.availableScenarios.map((s) => (
                    <tr key={s.path}>
                      <td>{s.name}</td>
                      <td>
                        <code>{s.path}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="config-section">
            <h2>Engine Packages</h2>
            <p className="config-hint">
              All <code>@omnia/*</code> workspace packages are consumed via{" "}
              <code>transpilePackages</code> in <code>next.config.ts</code>.
              The native <code>better-sqlite3</code> module is externalized via{" "}
              <code>serverExternalPackages</code>.
            </p>
          </section>
        </>
      )}

      <style>{`
        .config-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }
        .config-page h1 {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .config-section {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .config-section h2 {
          font-size: 1.125rem;
          margin-bottom: 0.75rem;
        }
        .config-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .config-label {
          color: #555;
          font-size: 0.875rem;
        }
        .config-value {
          font-size: 0.875rem;
        }
        .status-ok {
          color: #16a34a;
        }
        .status-error {
          color: #dc2626;
          font-weight: 500;
        }
        .config-hint {
          margin-top: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 4px;
          font-size: 0.8125rem;
          color: #92400e;
        }
        .config-hint code {
          background: rgba(0,0,0,0.06);
          padding: 0.125rem 0.25rem;
          border-radius: 2px;
          font-size: 0.75rem;
        }
        .error-banner {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          border-radius: 4px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .scenario-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .scenario-table th {
          text-align: left;
          padding: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
          color: #555;
          font-weight: 500;
        }
        .scenario-table td {
          padding: 0.5rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .scenario-table code {
          font-size: 0.8125rem;
          color: #2563eb;
        }
        code {
          font-family: monospace;
          font-size: 0.875rem;
        }

        /* Pill and List Styles */
        .status-pill {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status-pill.active {
          background: #dcfce7;
          color: #15803d;
        }
        .status-pill.inactive {
          background: #f3f4f6;
          color: #4b5563;
        }
        .action-buttons {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-sm:hover {
          background: #2563eb;
        }
        .btn-sm.delete-btn {
          background: #ef4444;
        }
        .btn-sm.delete-btn:hover {
          background: #dc2626;
        }
        /* Split container */
        .provider-split-container {
          display: grid;
          grid-template-columns: 1fr;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
          margin-top: 1rem;
          min-height: 400px;
        }
        @media (min-width: 768px) {
          .provider-split-container {
            grid-template-columns: 30% 70%;
          }
        }

        /* 30% List Pane */
        .provider-list-pane {
          border-right: 1px solid #e5e7eb;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
        }
        .pane-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f3f4f6;
        }
        .pane-header h3 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: #111;
        }
        .btn-add-inst {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
          font-weight: 500;
          background: #10b981;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-add-inst:hover {
          background: #059669;
        }
        .pane-list {
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .no-instances-msg {
          padding: 2rem 1rem;
          text-align: center;
          color: #6b7280;
          font-size: 0.8125rem;
        }
        .instance-list-item {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
          cursor: pointer;
          transition: background 0.15s, border-left 0.15s;
          border-left: 3px solid transparent;
        }
        .instance-list-item:hover {
          background: #f3f4f6;
        }
        .instance-list-item.active {
          background: #eff6ff;
          border-left: 3px solid #3b82f6;
        }
        .item-name {
          font-weight: 500;
          font-size: 0.875rem;
          color: #111;
        }
        .item-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.25rem;
          font-size: 0.75rem;
          color: #6b7280;
        }
        .active-pill {
          background: #dcfce7;
          color: #15803d;
          font-weight: 600;
          padding: 0.0625rem 0.375rem;
          border-radius: 9999px;
        }

        /* 70% Form Pane */
        .provider-form-pane {
          background: #fff;
          display: flex;
          flex-direction: column;
        }
        .provider-config-form {
          display: flex;
          flex-direction: column;
          height: 100%;
          justify-content: space-between;
        }
        .form-scroll-content {
          padding: 1.5rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-scroll-content h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.125rem;
          font-weight: 600;
          color: #111;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .form-group label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
        }
        .form-group input[type="text"],
        .form-group input[type="password"],
        .form-group select {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .form-group input:focus,
        .form-group select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .checkbox-group {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }
        .checkbox-group label {
          cursor: pointer;
        }
        .checkbox-group input {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }

        /* Action bar */
        .form-actions-bar {
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .btn-delete-pane {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          background: #ef4444;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-delete-pane:hover {
          background: #dc2626;
        }
        .btn-save-pane {
          padding: 0.5rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-save-pane:hover {
          background: #1d4ed8;
        }

        /* Task Provider Routing Styles */
        .mappings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          margin-top: 1rem;
        }
        @media (min-width: 768px) {
          .mappings-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .mapping-card {
          border: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .mapping-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.8125rem;
        }
        .mapping-info strong {
          font-size: 0.875rem;
          color: #111;
        }
        .mapping-card select {
          padding: 0.375rem 0.5rem;
          font-size: 0.8125rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: #fff;
          width: 100%;
        }
        .text-gray {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
