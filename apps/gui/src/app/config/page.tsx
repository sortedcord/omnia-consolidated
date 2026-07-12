"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getConfigStatus,
  listProviderInstances,
  getProviderMappings,
  setProviderMapping,
  getAvailableProviders,
  regenerateEmbeddings,
} from "@/app/play/actions";
import type { ModelProviderInstance, ModelProviderMeta } from "@omnia/llm";
import { ProviderInstancesConfig } from "@/components/config/ProviderInstancesConfig";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ConfigStatus {
  apiKeySet: boolean;
  apiKeyPreview: string;
  model: string;
  availableScenarios: { path: string; name: string }[];
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [instances, setInstances] = useState<ModelProviderInstance[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [availableProviders, setAvailableProviders] = useState<ModelProviderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInstances = useCallback(async () => {
    const list = await listProviderInstances();
    setInstances(list);
  }, []);

  const loadMappings = useCallback(async () => {
    const maps = await getProviderMappings();
    setMappings(maps);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const status = await getConfigStatus();
      setConfig(status);
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

  const handleUpdateMapping = async (task: string, providerInstanceId: string) => {
    if (task === "embeddings" && mappings[task] !== providerInstanceId) {
      const confirmChange = window.confirm(
        "Changing the embeddings provider will delete all existing embeddings and regenerate them from scratch. Are you sure you want to do this?"
      );
      if (!confirmChange) return;
    }

    try {
      setLoading(true);
      await setProviderMapping(task, providerInstanceId);
      if (task === "embeddings") {
        await regenerateEmbeddings(providerInstanceId);
      }
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

      {config === null && loading && <p>Loading configuration...</p>}
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {config && (
        <div className={loading ? "opacity-60 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
          <ProviderInstancesConfig
            instances={instances}
            availableProviders={availableProviders}
            mappings={mappings}
            onChanged={async () => {
              await loadInstances();
              await loadMappings();
            }}
          />

          <section className="mb-8 pb-6">
            <h2 className="mb-3 text-lg">Task Provider Routing</h2>
            <p className="my-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Configure which LLM Provider Key Instance should handle each
              specific simulation task. Mappings default to the currently{" "}
              <strong>Active</strong> instance if not specified.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { key: "actor-prose", label: "Actor Prose Generation", desc: "Generates roleplay/narrative prose for Non-Player Characters.", type: "generative" },
                { key: "llm-validator", label: "LLM Validator", desc: "Arbitrates and validates proposed actions against the world state rules.", type: "generative" },
                { key: "intent-decoder", label: "Intent Decoder", desc: "Splits raw prose actions into structured intents (Player and NPC).", type: "generative" },
                { key: "timedelta", label: "TimeDelta Generator", desc: "Calculates the duration of character actions to advance the game clock.", type: "generative" },
                { key: "handoff", label: "Memory Handoff Engine", desc: "Promotes entities' working memories to the long-term Ledger via LLM summarization and pruning.", type: "generative" },
                { key: "embeddings", label: "Text Embeddings Generator", desc: "Generates vector embeddings for long-term memory retrieval.", type: "embedding" },
              ].map((task) => (
                <div
                  key={task.key}
                  className="flex flex-col justify-between gap-3 rounded-lg border-2 bg-card p-4"
                >
                  <div className="flex flex-col gap-1 text-xs">
                    <strong className="text-sm text-foreground">
                      {task.label}
                    </strong>
                    <span className="mt-0.5 text-muted-foreground">{task.desc}</span>
                  </div>
                  <select
                    value={mappings[task.key] || ""}
                    onChange={(e) =>
                      handleUpdateMapping(task.key, e.target.value)
                    }
                    className="w-full rounded border-2 bg-input px-2 py-1.5 text-xs shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <option value="">-- Use Active Key (Default) --</option>
                    {instances
                      .filter((inst) => (inst.type || "generative") === task.type)
                      .map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} ({inst.providerName}){inst.isActive ? " [Active]" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8 pb-6">
            <h2 className="mb-3 text-lg">Available Scenarios</h2>
            {config.availableScenarios.length === 0 ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-800">
                No scenarios found in{" "}
                <code className="font-mono text-xs">
                  content/demo/scenarios/
                </code>
                .
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Path</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.availableScenarios.map((s) => (
                    <TableRow key={s.path}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-blue-600">
                          {s.path}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
