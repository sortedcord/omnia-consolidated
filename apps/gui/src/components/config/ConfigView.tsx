"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getConfigStatus,
  listProviderInstances,
  getProviderMappings,
  setProviderMapping,
  getAvailableProviders,
  regenerateEmbeddings,
} from "@/app/actions";
import type { ModelProviderInstance, ModelProviderMeta } from "@omnia/llm";
import { ProviderInstancesConfig } from "@/components/config/ProviderInstancesConfig";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function ConfigView() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [instances, setInstances] = useState<ModelProviderInstance[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [availableProviders, setAvailableProviders] = useState<
    ModelProviderMeta[]
  >([]);
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

  const handleUpdateMapping = async (
    task: string,
    providerInstanceId: string,
  ) => {
    if (task === "embeddings" && mappings[task] !== providerInstanceId) {
      const confirmChange = window.confirm(
        "Changing the embeddings provider will delete all existing embeddings and regenerate them from scratch. Are you sure you want to do this?",
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
    <div className="flex-1 overflow-y-auto w-full relative">
      <div className="relative z-10 mx-auto max-w-[1024px] px-10 py-12">
        <h1 className="mb-6 text-headline-lg text-primary animate-fade-in">
          Configuration
        </h1>
        <h2 className="mb-3 text-headline-md text-foreground">
          Manage Model Instances
        </h2>
        {config === null && loading && (
          <p className="text-body-md text-muted-foreground">
            Loading configuration...
          </p>
        )}
        {error && (
          <div className="mb-4 border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {config && (
          <div
            className={
              loading
                ? "opacity-60 pointer-events-none transition-opacity duration-200"
                : "transition-opacity duration-200"
            }
          >
            <ProviderInstancesConfig
              instances={instances}
              availableProviders={availableProviders}
              mappings={mappings}
              onChanged={async () => {
                await loadInstances();
                await loadMappings();
              }}
            />

            <section className="border-b border-dotted border-border/20 mb-8 pb-8">
              <h2 className="mb-3 text-headline-md text-foreground">
                Task Provider Routing
              </h2>
              <p className="my-4 border border-border/20 bg-secondary px-3 py-2 text-label-sm text-foreground/80">
                Configure which LLM Provider Key Instance should handle each
                specific simulation task. Mappings default to the currently{" "}
                <strong>Active</strong> instance if not specified.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                {[
                  {
                    key: "actor-prose",
                    label: "Actor Prose Generation",
                    desc: "Generates roleplay/narrative prose for Non-Player Characters.",
                    type: "generative",
                  },
                  {
                    key: "llm-validator",
                    label: "LLM Validator",
                    desc: "Arbitrates and validates proposed actions against the world state rules.",
                    type: "generative",
                  },
                  {
                    key: "intent-decoder",
                    label: "Intent Decoder",
                    desc: "Splits raw prose actions into structured intents (Player and NPC).",
                    type: "generative",
                  },
                  {
                    key: "timedelta",
                    label: "TimeDelta Generator",
                    desc: "Calculates the duration of character actions to advance the game clock.",
                    type: "generative",
                  },
                  {
                    key: "handoff",
                    label: "Memory Handoff Engine",
                    desc: "Promotes entities' Cognitive Buffer entries to the Memory Ledger via LLM summarization and pruning.",
                    type: "generative",
                  },
                  {
                    key: "embeddings",
                    label: "Text Embeddings Generator",
                    desc: "Generates vector embeddings for Memory Ledger retrieval.",
                    type: "embedding",
                  },
                ].map((task) => (
                  <div
                    key={task.key}
                    className="flex flex-col justify-between gap-3 border border-border/30 bg-card p-4 shadow-[2px_2px_0_0_var(--border)]"
                  >
                    <div className="flex flex-col gap-1">
                      <strong className="text-body-md text-foreground">
                        {task.label}
                      </strong>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {task.desc}
                      </span>
                    </div>
                    <Select
                      value={mappings[task.key] || ""}
                      onValueChange={(value) =>
                        handleUpdateMapping(task.key, value || "")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="-- Use Active Key (Default) --">
                          {(() => {
                            const inst = instances.find(
                              (i) => i.id === mappings[task.key],
                            );
                            return inst
                              ? `${inst.name} (${inst.providerName})${inst.isActive ? " [Active]" : ""}`
                              : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="">
                            -- Use Active Key (Default) --
                          </SelectItem>
                          {instances
                            .filter(
                              (inst) =>
                                (inst.type || "generative") === task.type,
                            )
                            .map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.name} ({inst.providerName})
                                {inst.isActive ? " [Active]" : ""}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="mb-3 text-headline-md text-foreground">
                Available Scenarios
              </h2>
              {config.availableScenarios.length === 0 ? (
                <p className="mt-3 border border-accent bg-accent/25 px-3 py-2 text-label-sm text-foreground/80">
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
                        <TableCell className="text-body-md">{s.name}</TableCell>
                        <TableCell>
                          <code className="font-mono text-xs text-primary">
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
    </div>
  );
}
