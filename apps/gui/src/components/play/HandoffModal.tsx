"use client";

import { useState } from "react";
import type { SimSnapshot } from "@/lib/simulation-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PromptAnalyzer } from "@/components/play/PromptAnalyzer";

interface HandoffModalProps {
  entry: SimSnapshot["log"][number];
  onClose: () => void;
}

export function HandoffModal({ entry, onClose }: HandoffModalProps) {
  const [activeTab, setActiveTab] = useState<"chunks" | "prompt" | "output">(
    "chunks",
  );

  const handoffResult = entry.handoffResult;
  const chunks = handoffResult?.chunks || [];

  const getImportanceColor = (score: number) => {
    if (score >= 8)
      return "bg-destructive/10 text-destructive border-destructive/30";
    if (score >= 5) return "bg-amber-500/10 text-amber-500 border-amber-500/30";
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-200 sm:max-w-200 h-[85vh] overflow-hidden flex flex-col p-0 gap-0 border-2">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-lg font-head tracking-wide text-primary flex items-center justify-between">
            <span>Memory Handoff Details &mdash; {entry.entityName}</span>
            {entry.usage && (
              <span className="text-xs font-mono font-normal text-muted-foreground">
                {entry.usage.modelName || "Handoff Model"}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Custom Tab Switcher */}
        <div className="flex border-b bg-muted/20 px-6 py-2 gap-2">
          <button
            onClick={() => setActiveTab("chunks")}
            className={`px-3 py-1.5 text-xs font-medium border transition-all duration-100 ${
              activeTab === "chunks"
                ? "border-primary bg-primary/10 text-primary shadow-[1px_1px_0_0_var(--primary)]"
                : "border-transparent hover:bg-secondary text-muted-foreground"
            }`}
          >
            Promoted Chunks ({chunks.length})
          </button>
          <button
            onClick={() => setActiveTab("prompt")}
            className={`px-3 py-1.5 text-xs font-medium border transition-all duration-100 ${
              activeTab === "prompt"
                ? "border-primary bg-primary/10 text-primary shadow-[1px_1px_0_0_var(--primary)]"
                : "border-transparent hover:bg-secondary text-muted-foreground"
            }`}
          >
            Raw LLM Prompt
          </button>
          <button
            onClick={() => setActiveTab("output")}
            className={`px-3 py-1.5 text-xs font-medium border transition-all duration-100 ${
              activeTab === "output"
                ? "border-primary bg-primary/10 text-primary shadow-[1px_1px_0_0_var(--primary)]"
                : "border-transparent hover:bg-secondary text-muted-foreground"
            }`}
          >
            Raw JSON Output
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {activeTab === "chunks" && (
            <div className="space-y-4">
              {entry.usage && (
                <div className="grid grid-cols-3 gap-4 border border-dotted border-border/20 p-3 bg-secondary/10 rounded text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground block uppercase tracking-wider text-[10px]">
                      Input Tokens
                    </span>
                    <strong className="text-foreground">
                      {entry.usage.inputTokens}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase tracking-wider text-[10px]">
                      Output Tokens
                    </span>
                    <strong className="text-foreground">
                      {entry.usage.outputTokens}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase tracking-wider text-[10px]">
                      Total Tokens
                    </span>
                    <strong className="text-foreground">
                      {entry.usage.totalTokens}
                    </strong>
                  </div>
                </div>
              )}

              {chunks.length === 0 ? (
                <div className="border border-dotted border-border/30 p-8 text-center bg-card text-muted-foreground rounded">
                  <p className="text-sm">
                    No memories were promoted to the Memory Ledger during this
                    turn.
                  </p>
                  <p className="text-xs mt-1">
                    All Cognitive Buffer entries were summarized or forgotten.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                    Memory Ledger Additions
                  </h3>
                  {chunks.map(
                    (
                      chunk: { content: string; importance: number },
                      index: number,
                    ) => (
                      <div
                        key={index}
                        className="border border-border/30 bg-card p-4 shadow-sm relative flex flex-col gap-3"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 text-sm text-foreground/90 leading-relaxed font-sans">
                            {chunk.content}
                          </div>
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs ${getImportanceColor(chunk.importance)}`}
                          >
                            Importance: {chunk.importance}
                          </Badge>
                        </div>

                        {chunk.quotes && chunk.quotes.length > 0 && (
                          <div className="bg-secondary/10 border-l-2 border-primary/50 p-2.5 my-1 text-xs italic text-muted-foreground space-y-1">
                            {chunk.quotes.map((quote: string, qIdx: number) => (
                              <div key={qIdx}>&ldquo;{quote}&rdquo;</div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 text-xs pt-2 border-t border-dotted border-border/10">
                          {chunk.retainInBuffer ? (
                            <Badge
                              variant="outline"
                              className="bg-primary/5 text-primary border-primary/20 text-[10px] font-mono"
                            >
                              Pinned in Buffer
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-muted text-muted-foreground border-border/20 text-[10px] font-mono"
                            >
                              Pruned from Buffer
                            </Badge>
                          )}

                          {chunk.involvedEntityIds &&
                            chunk.involvedEntityIds.length > 0 && (
                              <div className="flex items-center gap-1.5 ml-auto text-[10px] font-mono text-muted-foreground">
                                <span>Entities:</span>
                                {chunk.involvedEntityIds.map(
                                  (entId: string) => (
                                    <Badge
                                      key={entId}
                                      variant="outline"
                                      className="text-[10px] px-1 py-0 border-border/20 font-mono"
                                    >
                                      {entId}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "prompt" && entry.rawPrompt && (
            <PromptAnalyzer
              components={
                entry.rawPrompt.components &&
                entry.rawPrompt.components.length > 0
                  ? entry.rawPrompt.components
                  : [
                      {
                        label: "System Prompt",
                        type: "system",
                        content: entry.rawPrompt.systemPrompt || "",
                      },
                      {
                        label: "User Context",
                        type: "world",
                        content: entry.rawPrompt.userContext || "",
                      },
                    ]
              }
              inputTokens={entry.usage?.inputTokens || 0}
              maxContext={
                entry.usage?.maxContext !== undefined
                  ? entry.usage.maxContext
                  : 32768
              }
              modelName={entry.usage?.modelName}
              providerInstanceName={entry.usage?.providerInstanceName}
              outputLabel="LLM Output (Promoted Memory Chunks)"
              outputText={
                handoffResult
                  ? JSON.stringify(handoffResult, null, 2)
                  : undefined
              }
              outputTokens={entry.usage?.outputTokens}
            />
          )}

          {activeTab === "output" && (
            <div className="space-y-2 h-full flex flex-col">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Raw JSON Output
              </h4>
              <pre className="p-3 bg-muted rounded text-xs font-mono whitespace-pre-wrap text-foreground border flex-1 overflow-y-auto max-h-125">
                {handoffResult
                  ? JSON.stringify(handoffResult, null, 2)
                  : "No JSON Output recorded."}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
