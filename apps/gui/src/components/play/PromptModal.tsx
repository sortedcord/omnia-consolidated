"use client";

import { useEffect, useState } from "react";
import type { SimSnapshot } from "@/lib/simulation-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface PromptModalProps {
  entry: SimSnapshot["log"][number];
  onClose: () => void;
}

export function PromptModal({ entry, onClose }: PromptModalProps) {
  const [activeTab, setActiveTab] = useState<"actor" | "decoder">("actor");

  const parseActorPrompt = (systemPrompt: string, userContext: string, inputTokens: number) => {
    const memoryHeader = "=== YOUR RECENT MEMORY ===";
    const idx = userContext.indexOf(memoryHeader);

    let worldStr = userContext;
    let memStr = "";

    if (idx !== -1) {
      worldStr = userContext.substring(0, idx).trim();
      memStr = userContext.substring(idx).trim();
    }

    const sysLen = systemPrompt.length;
    const worldLen = worldStr.length;
    const memLen = memStr.length;
    const totalLen = sysLen + worldLen + memLen;

    if (totalLen === 0) return null;

    const sysPct = (sysLen / totalLen) * 100;
    const worldPct = (worldLen / totalLen) * 100;
    const memPct = (memLen / totalLen) * 100;

    const sysTokens = Math.round((sysLen / totalLen) * inputTokens);
    const worldTokens = Math.round((worldLen / totalLen) * inputTokens);
    const memTokens = Math.max(0, inputTokens - sysTokens - worldTokens);

    return [
      { label: "System Prompt", pct: sysPct, relativePct: sysPct, tokens: sysTokens, type: "system", content: systemPrompt },
      { label: "World Info", pct: worldPct, relativePct: worldPct, tokens: worldTokens, type: "world", content: worldStr },
      { label: "Recent Memories", pct: memPct, relativePct: memPct, tokens: memTokens, type: "memories", content: memStr || "(No memories yet.)" },
    ];
  };

  const parseDecoderPrompt = (systemPrompt: string, userContext: string, inputTokens: number) => {
    const proseHeader = "=== NARRATIVE PROSE ===";
    const idx = userContext.indexOf(proseHeader);

    let worldStr = userContext;
    let proseStr = "";

    if (idx !== -1) {
      worldStr = userContext.substring(0, idx).trim();
      proseStr = userContext.substring(idx).trim();
    }

    const sysLen = systemPrompt.length;
    const worldLen = worldStr.length;
    const proseLen = proseStr.length;
    const totalLen = sysLen + worldLen + proseLen;

    if (totalLen === 0) return null;

    const sysPct = (sysLen / totalLen) * 100;
    const worldPct = (worldLen / totalLen) * 100;
    const prosePct = (proseLen / totalLen) * 100;

    const sysTokens = Math.round((sysLen / totalLen) * inputTokens);
    const worldTokens = Math.round((worldLen / totalLen) * inputTokens);
    const proseTokens = Math.max(0, inputTokens - sysTokens - worldTokens);

    return [
      { label: "System Prompt", pct: sysPct, relativePct: sysPct, tokens: sysTokens, type: "system", content: systemPrompt },
      { label: "Decoder Context", pct: worldPct, relativePct: worldPct, tokens: worldTokens, type: "world", content: worldStr },
      { label: "Narrative Prose", pct: prosePct, relativePct: prosePct, tokens: proseTokens, type: "memories", content: proseStr },
    ];
  };

  const actorBreakdown = (entry.rawPrompt && entry.usage) ? parseActorPrompt(entry.rawPrompt.systemPrompt, entry.rawPrompt.userContext, entry.usage.inputTokens) : null;
  const decoderBreakdown = (entry.decoderPrompt && entry.decoderUsage) ? parseDecoderPrompt(entry.decoderPrompt.systemPrompt, entry.decoderPrompt.userContext, entry.decoderUsage.inputTokens) : null;

  const actorMaxContext = entry.usage?.maxContext !== undefined ? entry.usage.maxContext : 32768;
  const actorUsedTokens = entry.usage?.inputTokens || 0;
  const actorUsagePctOfContext = actorMaxContext > 0 ? (actorUsedTokens / actorMaxContext) * 100 : 0;
  const isActorAbsolute = actorMaxContext > 0 && actorUsagePctOfContext >= 20;

  const scaledActorBreakdown = actorBreakdown ? actorBreakdown.map((item) => ({
    ...item,
    pct: isActorAbsolute ? item.relativePct * (actorUsedTokens / actorMaxContext) : item.relativePct
  })) : null;

  const decoderMaxContext = entry.decoderUsage?.maxContext !== undefined ? entry.decoderUsage.maxContext : 32768;
  const decoderUsedTokens = entry.decoderUsage?.inputTokens || 0;
  const decoderUsagePctOfContext = decoderMaxContext > 0 ? (decoderUsedTokens / decoderMaxContext) * 100 : 0;
  const isDecoderAbsolute = decoderMaxContext > 0 && decoderUsagePctOfContext >= 20;

  const scaledDecoderBreakdown = decoderBreakdown ? decoderBreakdown.map((item) => ({
    ...item,
    pct: isDecoderAbsolute ? item.relativePct * (decoderUsedTokens / decoderMaxContext) : item.relativePct
  })) : null;

  useEffect(() => {
    if (!entry.rawPrompt && entry.decoderPrompt) {
      setActiveTab("decoder");
    }
  }, [entry]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[750px] sm:max-w-[750px] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle>Raw Prompts & Token Usage ({entry.entityName})</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "actor" | "decoder")}>
          <TabsList className="w-full rounded-none border-b bg-muted/50 px-5">
            <TabsTrigger value="actor" disabled={!entry.rawPrompt} className="flex-1">
              Actor Prompt {entry.usage ? "📊" : ""}
            </TabsTrigger>
            <TabsTrigger value="decoder" disabled={!entry.decoderPrompt} className="flex-1">
              Intent Decoder {entry.decoderUsage ? "📊" : ""}
            </TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto flex-1 p-5">
            <TabsContent value="actor">
              {entry.rawPrompt && (
                <div className="flex flex-col gap-4">
                  {entry.usage ? (
                    <div className="rounded border-2 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      <strong>LLM Instance:</strong> <span>{entry.usage.providerInstanceName || "Default"}</span>
                      {entry.usage.modelName && (
                        <span> ({entry.usage.modelName})</span>
                      )}
                    </div>
                  ) : (
                    <div className="rounded border-2 bg-muted/50 px-3 py-2 text-sm italic text-muted-foreground">
                      No LLM token usage (Player turn used fixed prose).
                    </div>
                  )}

                  {scaledActorBreakdown && (
                    <div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                        <span className="font-semibold">Input Prompt Breakdown</span>
                        <span>
                          Total Input Tokens: <strong>{actorUsedTokens}</strong>
                          {actorMaxContext > 0 ? (
                            <span> / {actorMaxContext} ({actorUsagePctOfContext.toFixed(1)}% used)</span>
                          ) : (
                            <span> (infinite context)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-6 w-full rounded overflow-hidden bg-muted shadow-inner mb-2">
                        {scaledActorBreakdown.map((item, idx) => {
                          const displayPct = actorMaxContext > 0 ? (item.tokens / actorMaxContext) * 100 : item.relativePct;
                          return (
                            <div
                              key={idx}
                              className={`h-full transition-all duration-300 ${
                                item.type === "system" ? "bg-blue-500" : item.type === "world" ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                              style={{ width: `${item.pct}%` }}
                              title={`${item.label}: ${item.tokens} tokens (${displayPct.toFixed(1)}%)`}
                            />
                          );
                        })}
                        {isActorAbsolute && (
                          <div
                            className="bg-white h-full"
                            style={{ width: `${100 - actorUsagePctOfContext}%` }}
                            title={`Available: ${actorMaxContext - actorUsedTokens} tokens (${(100 - actorUsagePctOfContext).toFixed(1)}% remaining)`}
                          />
                        )}
                      </div>
                      <Accordion type="multiple" defaultValue={["0"]}>
                        {scaledActorBreakdown.map((item, idx) => {
                          const displayPct = actorMaxContext > 0 ? (item.tokens / actorMaxContext) * 100 : item.relativePct;
                          return (
                            <AccordionItem key={idx} value={String(idx)}>
                              <AccordionTrigger className="text-sm">
                                <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-2 ${
                                  item.type === "system" ? "bg-blue-500" : item.type === "world" ? "bg-emerald-500" : "bg-amber-500"
                                }`} />
                                {item.label}: <strong>{item.tokens}</strong> tokens ({displayPct.toFixed(0)}%)
                              </AccordionTrigger>
                              <AccordionContent>
                                <pre className="m-0 p-2 bg-muted rounded text-xs font-mono whitespace-pre-wrap max-h-[250px] overflow-y-auto text-foreground">
                                  {item.content}
                                </pre>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </div>
                  )}

                  {entry.usage && (
                    <div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                        <span className="font-semibold">LLM Output</span>
                        <span>Total Output Tokens: <strong>{entry.usage.outputTokens}</strong></span>
                      </div>
                      <div className="rounded border-2">
                        <pre className="m-0 p-2 bg-muted text-xs font-mono whitespace-pre-wrap max-h-[250px] overflow-y-auto text-foreground">
                          {entry.narrativeProse}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="decoder">
              {entry.decoderPrompt && (
                <div className="flex flex-col gap-4">
                  {entry.decoderUsage && (
                    <div className="rounded border-2 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      <strong>LLM Instance:</strong> <span>{entry.decoderUsage.providerInstanceName || "Default"}</span>
                      {entry.decoderUsage.modelName && (
                        <span> ({entry.decoderUsage.modelName})</span>
                      )}
                    </div>
                  )}

                  {scaledDecoderBreakdown && (
                    <div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                        <span className="font-semibold">Input Prompt Breakdown</span>
                        <span>
                          Total Input Tokens: <strong>{decoderUsedTokens}</strong>
                          {decoderMaxContext > 0 ? (
                            <span> / {decoderMaxContext} ({decoderUsagePctOfContext.toFixed(1)}% used)</span>
                          ) : (
                            <span> (infinite context)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-6 w-full rounded overflow-hidden bg-muted shadow-inner mb-2">
                        {scaledDecoderBreakdown.map((item, idx) => {
                          const displayPct = decoderMaxContext > 0 ? (item.tokens / decoderMaxContext) * 100 : item.relativePct;
                          return (
                            <div
                              key={idx}
                              className={`h-full transition-all duration-300 ${
                                item.type === "system" ? "bg-blue-500" : item.type === "world" ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                              style={{ width: `${item.pct}%` }}
                              title={`${item.label}: ${item.tokens} tokens (${displayPct.toFixed(1)}%)`}
                            />
                          );
                        })}
                        {isDecoderAbsolute && (
                          <div
                            className="bg-white h-full"
                            style={{ width: `${100 - decoderUsagePctOfContext}%` }}
                            title={`Available: ${decoderMaxContext - decoderUsedTokens} tokens (${(100 - decoderUsagePctOfContext).toFixed(1)}% remaining)`}
                          />
                        )}
                      </div>
                      <Accordion type="multiple" defaultValue={["0"]}>
                        {scaledDecoderBreakdown.map((item, idx) => {
                          const displayPct = decoderMaxContext > 0 ? (item.tokens / decoderMaxContext) * 100 : item.relativePct;
                          return (
                            <AccordionItem key={idx} value={String(idx)}>
                              <AccordionTrigger className="text-sm">
                                <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-2 ${
                                  item.type === "system" ? "bg-blue-500" : item.type === "world" ? "bg-emerald-500" : "bg-amber-500"
                                }`} />
                                {item.label}: <strong>{item.tokens}</strong> tokens ({displayPct.toFixed(0)}%)
                              </AccordionTrigger>
                              <AccordionContent>
                                <pre className="m-0 p-2 bg-muted rounded text-xs font-mono whitespace-pre-wrap max-h-[250px] overflow-y-auto text-foreground">
                                  {item.content}
                                </pre>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </div>
                  )}

                  {entry.decoderUsage && (
                    <div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                        <span className="font-semibold">LLM Output</span>
                        <span>Total Output Tokens: <strong>{entry.decoderUsage.outputTokens}</strong></span>
                      </div>
                      <div className="rounded border-2">
                        <pre className="m-0 p-2 bg-muted text-xs font-mono whitespace-pre-wrap max-h-[250px] overflow-y-auto text-foreground">
                          {JSON.stringify(entry.intents, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
