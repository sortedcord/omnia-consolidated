"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SimSnapshot } from "@/lib/simulation-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatSimDate, formatSimTimeHM, getClockIcon } from "@/lib/utils";

interface InteractDockProps {
  snapshot: SimSnapshot;
  loading: boolean;
  playerInput: string;
  setPlayerInput: (value: string) => void;
  onSubmitAction: (e: React.FormEvent<HTMLFormElement>) => void;
  onPauseRequested: () => void;
  onResumeRequested: () => void;
  onStopRequested: () => void;
}

export function InteractDock({
  snapshot,
  loading,
  playerInput,
  setPlayerInput,
  onSubmitAction,
  onPauseRequested,
  onResumeRequested,
  onStopRequested,
}: InteractDockProps) {
  const router = useRouter();

  return (
    <footer className="sticky bottom-0 px-8 py-4 z-20 shrink-0 bg-background/70 backdrop-blur-md border-t border-border/10">
      <div className="max-w-200 mx-auto relative">
        {snapshot.status === "running" ||
        snapshot.status === "waiting_player" ? (
          <div className="border border-border/30 bg-card/85 p-4 shadow-sm backdrop-blur-sm relative z-10">
            {snapshot.status === "waiting_player" && snapshot.waitingEntity && (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium font-head text-primary select-none outline-none">
                  <strong>Your context as {snapshot.waitingEntity.name}</strong>
                </summary>
                <pre className="text-xs whitespace-pre-wrap bg-input border border-border/20 p-2 max-h-37.5 overflow-y-auto mt-2 font-mono">
                  {snapshot.waitingEntity.userContext}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center gap-2">
                {snapshot.worldTime ? (
                  <span className="text-base font-mono text-muted-foreground font-medium">
                    <img
                      src="/calendar_logo.png"
                      alt="Date"
                      className="w-7 h-7 inline-block align-middle mr-1 opacity-70"
                    />
                    {formatSimDate(snapshot.worldTime)}
                    <img
                      src={getClockIcon(snapshot.worldTime)}
                      alt="Time"
                      className="w-7 h-7 inline-block align-middle ml-2 mr-1 opacity-70"
                    />
                    {formatSimTimeHM(snapshot.worldTime)}
                    {snapshot.currentLocation && (
                      <>
                        <img
                          src="/map_pointer_icon.png"
                          alt="Location"
                          className="w-7 h-7 inline-block align-middle ml-2 mr-1 opacity-70"
                        />
                        {snapshot.currentLocation}
                      </>
                    )}
                  </span>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  {loading ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={onPauseRequested}
                    >
                      Pause
                    </Button>
                  ) : (
                    snapshot.status === "running" && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={onResumeRequested}
                      >
                        Resume
                      </Button>
                    )
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={onStopRequested}
                  >
                    Stop
                  </Button>
                </div>
              </div>

              {snapshot.status === "waiting_player" &&
                snapshot.waitingEntity && (
                  <form
                    onSubmit={onSubmitAction}
                    className="flex flex-row gap-2 items-stretch"
                  >
                    <Textarea
                      value={playerInput}
                      onChange={(e) => setPlayerInput(e.target.value)}
                      placeholder="Describe what your character does, says, or thinks..."
                      rows={3}
                      className="flex-1 min-h-26"
                      disabled={loading}
                    />
                    <Button
                      type="submit"
                      disabled={loading || !playerInput.trim()}
                      className="w-32 shrink-0 self-stretch"
                    >
                      {loading ? "Processing..." : "Submit"}
                    </Button>
                  </form>
                )}
            </div>
          </div>
        ) : snapshot.status === "done" || snapshot.status === "error" ? (
          <div className="flex justify-between items-center bg-card/85 border border-border/30 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-mono text-muted-foreground">
                {snapshot.status === "error"
                  ? "Simulation finished with an error."
                  : "Simulation complete."}
              </span>
              {snapshot.worldTime && (
                <div className="flex items-center gap-2 text-base font-mono text-muted-foreground">
                  <img
                    src="/calendar_logo.png"
                    alt="Date"
                    className="w-7 h-7 opacity-70"
                  />
                  <span>{formatSimDate(snapshot.worldTime)}</span>
                  <img
                    src={getClockIcon(snapshot.worldTime)}
                    alt="Time"
                    className="w-7 h-7 opacity-70"
                  />
                  <span>{formatSimTimeHM(snapshot.worldTime)}</span>
                  {snapshot.currentLocation && (
                    <>
                      <img
                        src="/map_pointer_icon.png"
                        alt="Location"
                        className="w-7 h-7 opacity-70"
                      />
                      <span>{snapshot.currentLocation}</span>
                    </>
                  )}
                </div>
              )}
            </div>
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
  );
}
