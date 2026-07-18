"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startSimulation,
  listSavedSimulations,
  getConfigStatus,
  getScenarioEntities,
  deleteSimulation,
  listProviderInstances,
} from "@/app/actions";
import type { SimSnapshot } from "@/lib/simulation-types";
import type { ModelProviderInstance } from "@omnia/llm";
import { Button } from "@/components/ui/button";
import { ScenarioCard } from "@/components/play/ScenarioCard";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export function HomeView() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const [savedSessions, setSavedSessions] = useState<SimSnapshot[]>([]);
  const [scenarios, setScenarios] = useState<
    { path: string; name: string; description: string }[]
  >([]);
  const [providerInstances, setProviderInstances] = useState<
    ModelProviderInstance[]
  >([]);

  // Modal State
  const [scenarioForModal, setScenarioForModal] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [modalEntities, setModalEntities] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedEntityForModal, setSelectedEntityForModal] =
    useState<string>("");
  const [customName, setCustomName] = useState<string>("");

  const loadSavedSessions = useCallback(async () => {
    try {
      const res = await listSavedSimulations();
      if (res.ok) {
        setSavedSessions(res.sessions);
      }
    } catch {
      // sessions load failed, ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoadingData(true);
      try {
        const sessionsRes = await listSavedSimulations();
        if (active && sessionsRes.ok) {
          setSavedSessions(sessionsRes.sessions);
        }
      } catch {
        // session load failed, ignore
      }

      try {
        const configStatus = await getConfigStatus();
        if (active) {
          setScenarios(configStatus.availableScenarios);
        }
      } catch {
        // scenarios load failed, ignore
      }

      try {
        const providersList = await listProviderInstances();
        if (active) {
          setProviderInstances(providersList);
        }
      } catch {
        // providers load failed, ignore
      }

      if (active) {
        setLoadingData(false);
      }
    }
    loadAll();
    return () => {
      active = false;
    };
  }, []);

  const handleResume = (id: string) => {
    router.push(`/play?simId=${id}`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this simulation session?"))
      return;
    setLoading(true);
    try {
      const res = await deleteSimulation(id);
      if (!res.ok) {
        setError(res.error);
      } else {
        await loadSavedSessions();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete session.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleScenarioClick = async (scenario: {
    path: string;
    name: string;
  }) => {
    setScenarioForModal(scenario);
    setLoadingEntities(true);
    setSelectedEntityForModal(""); // Reset selection to Spectator
    setCustomName(scenario.name); // Set custom simulation name default
    try {
      const res = await getScenarioEntities(scenario.path);
      if (res.ok) {
        setModalEntities(res.entities);
      } else {
        setModalEntities([]);
      }
    } catch {
      setModalEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleStartFromModal = async () => {
    if (!scenarioForModal) return;
    setLoading(true);
    setError("");
    const targetScenario = scenarioForModal;
    setScenarioForModal(null); // close modal
    try {
      const result = await startSimulation({
        scenario: targetScenario.path,
        playEntity: selectedEntityForModal || undefined,
        customName: customName.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Navigate to the separate play page with the newly created simulation ID
      router.push(`/play?simId=${result.snapshot.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start simulation.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto w-full relative">
      <div className="relative z-10 mx-auto max-w-[1024px] px-10 py-12">
        <div className="animate-fade-in">
          {/* Centered Big Logo */}
          <div className="flex flex-col items-center justify-center mb-10 pt-4">
            <img
              src="/logo-shadow.png"
              alt="Omnia Logo"
              className="h-28 object-contain mb-3"
            />
          </div>

          {error && (
            <div className="mb-6 border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {providerInstances.length === 0 && !loadingData && (
            <div className="mb-6 border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 flex flex-col gap-2">
              <span className="font-semibold flex items-center gap-1">
                ⚠️ No LLM providers have been configured.
              </span>
              <span>
                Please go to the{" "}
                <Link
                  href="/config"
                  className="underline font-medium hover:text-yellow-700"
                >
                  Configuration
                </Link>{" "}
                page to set up at least one provider before running simulations.
              </span>
            </div>
          )}

          {/* Simulations Section */}
          <section className="mb-10">
            <h2 className="text-headline-lg text-primary mb-6 animate-fade-in">
              Simulations
            </h2>
            {loadingData ? (
              <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-thin scrollbar-thumb-border/20">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-72 border border-border/30 bg-card p-5 shadow-sm transition-all flex flex-col justify-between h-[148px]"
                  >
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : savedSessions.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No saved simulations found. Start a new one below!
              </p>
            ) : (
              <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-thin scrollbar-thumb-border/20">
                {savedSessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={
                      providerInstances.length === 0
                        ? undefined
                        : () => handleResume(s.id)
                    }
                    className={`flex-shrink-0 w-72 border border-border/30 bg-card p-5 shadow-sm transition-all relative group ${
                      providerInstances.length === 0
                        ? "opacity-50 cursor-not-allowed filter grayscale"
                        : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm"
                    }`}
                  >
                    <div className="flex flex-col gap-1 text-sm mb-4">
                      <strong className="text-body-md text-foreground block">
                        {s.scenarioName}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Turn {s.turn} &middot; {s.entities.length} entities
                        &middot; {s.status}
                      </span>
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        ID: {s.id.substring(0, 8)}...
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-xs text-primary font-mono uppercase tracking-wider">
                        Resume
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => handleDelete(s.id, e)}
                        disabled={loading}
                        title="Delete Session"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Scenarios Section */}
          <section className="mb-10">
            <h2 className="text-headline-lg text-primary mb-6 animate-fade-in">
              Scenarios
            </h2>
            {loadingData ? (
              <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-thin scrollbar-thumb-border/20">
                <Link href="/builder" className="no-underline flex-shrink-0">
                  <div className="w-64 border border-border/30 bg-card p-5 cursor-pointer shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm transition-all flex flex-col justify-between h-full min-h-[148px]">
                    <div>
                      <strong className="text-body-md text-foreground block mb-1">
                        Build a scenario
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Create a custom simulation starting point
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-xs font-mono uppercase tracking-wider text-primary">
                      <span className="flex items-center justify-center size-5 border border-primary text-primary font-bold text-sm bg-primary/10">
                        +
                      </span>
                      <span>Create New</span>
                    </div>
                  </div>
                </Link>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-64 border border-border/30 bg-card p-5 shadow-sm flex flex-col justify-between h-[148px]"
                  >
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <div className="mt-4">
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-thin scrollbar-thumb-border/20">
                <Link href="/builder" className="no-underline flex-shrink-0">
                  <div className="w-64 border border-primary bg-primary p-5 cursor-pointer shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm transition-all flex flex-col justify-between h-full min-h-[148px]">
                    <div>
                      <strong className="text-body-md text-surface block mb-1">
                        Build a scenario
                      </strong>
                      <span className="text-xs text-surface/80">
                        Create a custom simulation starting point
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-xs font-mono uppercase tracking-wider text-surface">
                      <span className="flex items-center justify-center size-5 border border-surface text-surface font-bold text-sm bg-surface/20">
                        +
                      </span>
                      <span>Create New</span>
                    </div>
                  </div>
                </Link>
                {scenarios.map((s) => (
                  <ScenarioCard
                    key={s.path}
                    name={s.name}
                    description={s.description}
                    onClick={() => handleScenarioClick(s)}
                    disabled={providerInstances.length === 0}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Start Scenario Selection Modal */}
          {scenarioForModal && (
            <Dialog
              open={!!scenarioForModal}
              onOpenChange={(open) => !open && setScenarioForModal(null)}
            >
              <DialogContent className="max-w-[400px]">
                <DialogHeader className="border-b border-dotted border-border/20 pb-4 mb-2">
                  <DialogTitle>Start Scenario</DialogTitle>
                  <DialogDescription>
                    Choose how you want to interact with{" "}
                    <strong>{scenarioForModal.name}</strong>.
                  </DialogDescription>
                </DialogHeader>

                {loadingEntities ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                    <Spinner />
                    <span>Loading scenario entities...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                        Custom Simulation Name
                      </label>
                      <Input
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Enter custom name..."
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                        Simulation Mode / Play as
                      </label>
                      <Select
                        value={selectedEntityForModal}
                        onValueChange={(val) =>
                          setSelectedEntityForModal(val || "")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="-- Run Fully Autonomously --" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="">
                              -- Run Fully Autonomously --
                            </SelectItem>
                            {modalEntities.map((ent) => (
                              <SelectItem key={ent.id} value={ent.id}>
                                Play as {ent.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setScenarioForModal(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartFromModal}
                    disabled={loading || loadingEntities}
                  >
                    {loading ? "Starting..." : "Launch"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
