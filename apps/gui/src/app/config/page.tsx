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

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editProvider, setEditProvider] = useState("google-genai");
  const [editKey, setEditKey] = useState("");
  const [editModel, setEditModel] = useState("gemini-2.5-flash");
  const [editIsActive, setEditIsActive] = useState(false);

  useEffect(() => {
    if (selectedInstanceId === null) {
      setEditName("");
      setEditProvider("google-genai");
      setEditKey("");
      setEditModel("gemini-2.5-flash");
      setEditIsActive(false);
    } else if (selectedInstanceId === "new") {
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
    if (selectedInstanceId === "new" || selectedInstanceId === null) return;
    if (!confirm("Are you sure you want to delete this provider instance?")) return;

    try {
      setLoading(true);
      setError("");
      await deleteProviderInstance(selectedInstanceId);
      setSelectedInstanceId(null);
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
    <div className="mx-auto max-w-[800px] px-4 py-8">
      <h1 className="mb-6 text-2xl">Configuration</h1>

      {loading && <p>Loading configuration...</p>}
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {config && !loading && (
        <>
          <section className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="mb-3 text-lg">LLM Provider Instances</h2>
            <div className="mt-4 grid min-h-[400px] grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white md:grid-cols-[30%_70%]">
              {/* 30% area */}
              <div className="flex flex-col border-r border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-4">
                  <h3 className="m-0 text-[0.95rem] font-semibold text-[#111]">Instances</h3>
                  <button
                    onClick={() => setSelectedInstanceId("new")}
                    className="cursor-pointer rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                    type="button"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-1 flex-col overflow-y-auto">
                  {instances.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-gray-400">
                      No instances configured
                    </div>
                  ) : (
                    instances.map((inst) => (
                      <div
                        key={inst.id}
                        onClick={() => setSelectedInstanceId(inst.id)}
                        className={`cursor-pointer border-b border-gray-200 border-l-[3px] px-4 py-4 transition-all hover:bg-gray-100 ${
                          selectedInstanceId === inst.id
                            ? "border-l-blue-500 bg-blue-50"
                            : "border-l-transparent"
                        }`}
                      >
                        <div className="text-sm font-medium text-[#111]">{inst.name}</div>
                        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                          <span>{inst.providerName}</span>
                          {inst.isActive && (
                            <span className="rounded-full bg-green-100 px-1.5 py-[1px] text-[0.65rem] font-semibold text-green-700">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 70% area */}
              <div className="flex flex-col bg-white">
                {selectedInstanceId === null ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-gray-400">
                    Press + to add or select an existing Instance to edit
                  </div>
                ) : (
                  <form onSubmit={handleSave} className="flex h-full flex-col justify-between">
                    <div className="flex flex-1 flex-col gap-5 p-6">
                      <h3 className="m-0 mb-2 text-lg font-semibold text-[#111]">
                        {selectedInstanceId === "new"
                          ? "Create New Provider Instance"
                          : `Configure: ${editName}`}
                      </h3>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="formName" className="text-xs font-medium text-gray-700">
                          Friendly Name
                        </label>
                        <input
                          id="formName"
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="e.g. Gemini - Production"
                          required
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="formProvider" className="text-xs font-medium text-gray-700">
                          Provider Type
                        </label>
                        <select
                          id="formProvider"
                          value={editProvider}
                          onChange={(e) => handleProviderChange(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15"
                        >
                          {availableProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                        {editProvider && availableProviders.length > 0 && (
                          <span className="mt-1 block rounded border border-gray-200 bg-gray-100 px-3 py-2 text-xs text-gray-600">
                            {availableProviders.find((p) => p.id === editProvider)?.description}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="formKey" className="text-xs font-medium text-gray-700">
                          API Key
                        </label>
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
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="formModel" className="text-xs font-medium text-gray-700">
                          Model Name
                        </label>
                        <input
                          id="formModel"
                          type="text"
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          placeholder="e.g. gemini-2.5-flash, gemini-2.5-pro"
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15"
                        />
                      </div>

                      <div className="mt-1 flex flex-row items-center gap-2">
                        <input
                          id="formActive"
                          type="checkbox"
                          checked={editIsActive}
                          onChange={(e) => setEditIsActive(e.target.checked)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <label htmlFor="formActive" className="cursor-pointer text-xs font-medium text-gray-700">
                          Set as Active Instance
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
                      <div>
                        {selectedInstanceId !== "new" && (
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={loading}
                            className="cursor-pointer rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="cursor-pointer rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          {loading ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>

          <section className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="mb-3 text-lg">Task Provider Routing</h2>
            <p className="my-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Configure which LLM Provider Key Instance should handle each specific simulation
              task. Mappings default to the currently <strong>Active</strong> instance if not
              specified.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { key: "actor-prose", label: "Actor Prose Generation", desc: "Generates roleplay/narrative prose for Non-Player Characters." },
                { key: "llm-validator", label: "LLM Validator", desc: "Arbitrates and validates proposed actions against the world state rules." },
                { key: "intent-decoder", label: "Intent Decoder", desc: "Splits raw prose actions into structured intents (Player and NPC)." },
                { key: "timedelta", label: "TimeDelta Generator", desc: "Calculates the duration of character actions to advance the game clock." },
              ].map((task) => (
                <div
                  key={task.key}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-1 text-xs">
                    <strong className="text-sm text-[#111]">{task.label}</strong>
                    <span className="mt-0.5 text-gray-500">{task.desc}</span>
                  </div>
                  <select
                    value={mappings[task.key] || ""}
                    onChange={(e) => handleUpdateMapping(task.key, e.target.value)}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">Use Default Provider</option>
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

          <section className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="mb-3 text-lg">Environment Variables Default</h2>
            <div className="flex justify-between border-b border-gray-100 py-1.5">
              <span className="text-sm text-gray-500">Default Model</span>
              <span className="text-sm">
                <code className="font-mono text-sm">{config.model}</code>
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1.5">
              <span className="text-sm text-gray-500">Default API Key (.env)</span>
              <span
                className={
                  config.apiKeySet
                    ? "text-sm text-green-600"
                    : "text-sm font-medium text-red-600"
                }
              >
                {config.apiKeySet
                  ? `✓ Set (${config.apiKeyPreview})`
                  : "✗ NOT SET"}
              </span>
            </div>
          </section>

          <section className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="mb-3 text-lg">Available Scenarios</h2>
            {config.availableScenarios.length === 0 ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-800">
                No scenarios found in <code className="font-mono text-xs">content/demo/scenarios/</code>.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b-2 border-gray-200 p-2 text-left font-medium text-gray-500">
                      Name
                    </th>
                    <th className="border-b-2 border-gray-200 p-2 text-left font-medium text-gray-500">
                      Path
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {config.availableScenarios.map((s) => (
                    <tr key={s.path}>
                      <td className="border-b border-gray-100 p-2">{s.name}</td>
                      <td className="border-b border-gray-100 p-2">
                        <code className="font-mono text-xs text-blue-600">{s.path}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="mb-3 text-lg">Engine Packages</h2>
            <p className="mt-3 rounded border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-800">
              All <code className="font-mono text-xs">@omnia/*</code> workspace packages are
              consumed via <code className="font-mono text-xs">transpilePackages</code> in{" "}
              <code className="font-mono text-xs">next.config.ts</code>. The native{" "}
              <code className="font-mono text-xs">better-sqlite3</code> module is externalized
              via <code className="font-mono text-xs">serverExternalPackages</code>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
