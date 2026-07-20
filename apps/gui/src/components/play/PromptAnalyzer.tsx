"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PromptComponent } from "@/lib/simulation-types";

interface PromptAnalyzerProps {
  components: PromptComponent[];
  inputTokens: number;
  maxContext?: number;
  modelName?: string;
  providerInstanceName?: string;
  outputLabel?: string;
  outputText?: string;
  outputTokens?: number;
}

export function PromptAnalyzer({
  components,
  inputTokens,
  maxContext = 32768,
  modelName,
  providerInstanceName,
  outputLabel = "LLM Output",
  outputText,
  outputTokens,
}: PromptAnalyzerProps) {
  const totalLen = components.reduce((sum, s) => sum + s.content.length, 0);

  if (totalLen === 0) {
    return (
      <div className="text-sm italic text-muted-foreground">
        No prompt context recorded.
      </div>
    );
  }

  const sections = components.map((s) => {
    const pct = totalLen > 0 ? (s.content.length / totalLen) * 100 : 0;
    return {
      ...s,
      pct,
      tokens: Math.round((s.content.length / totalLen) * inputTokens),
    };
  });

  const usagePctOfContext =
    maxContext > 0 ? (inputTokens / maxContext) * 100 : 0;
  const isAbsolute = maxContext > 0 && usagePctOfContext >= 20;

  const legentColors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-amber-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-sky-500",
    "bg-lime-500",
    "bg-fuchsia-500",
    "bg-red-500",
  ];

  const getColorClass = (index: number) => {
    return legentColors[index % legentColors.length];
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Provider Details */}
      {(providerInstanceName || modelName) && (
        <div className="rounded border-2 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <strong>LLM Instance:</strong>{" "}
          <span>{providerInstanceName || "Default"}</span>
          {modelName && <span> ({modelName})</span>}
        </div>
      )}

      {/* Progress Bar & Breakdown */}
      <div>
        <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
          <span className="font-semibold">Input Prompt Breakdown</span>
          <span>
            Total Input Tokens: <strong>{inputTokens}</strong>
            {maxContext > 0 ? (
              <span>
                {" "}
                / {maxContext} ({usagePctOfContext.toFixed(1)}% used)
              </span>
            ) : (
              <span> (infinite context)</span>
            )}
          </span>
        </div>

        {/* Token Bar */}
        <div className="flex h-6 w-full rounded border overflow-hidden bg-muted shadow-inner mb-2">
          {sections.map((item, idx) => {
            const widthPct = isAbsolute
              ? item.pct * (inputTokens / maxContext)
              : item.pct;
            return (
              <div
                key={idx}
                className={`h-full transition-all duration-300 ${getColorClass(idx)}`}
                style={{ width: `${widthPct}%` }}
                title={`${item.label}: ${item.tokens} tokens (${item.pct.toFixed(1)}%)`}
              />
            );
          })}
          {isAbsolute && (
            <div
              className="bg-white h-full"
              style={{ width: `${100 - usagePctOfContext}%` }}
              title={`Available: ${maxContext - inputTokens} tokens (${(100 - usagePctOfContext).toFixed(1)}% remaining)`}
            />
          )}
        </div>

        {/* Accordion Components */}
        <Accordion type="multiple" className="w-full">
          {sections.map((item, idx) => {
            return (
              <AccordionItem key={idx} value={String(idx)}>
                <AccordionTrigger className="text-sm py-2.5 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-sm ${getColorClass(idx)}`}
                    />
                    <span>{item.label}:</span>
                    <span className="text-muted-foreground font-normal">
                      <strong>{item.tokens}</strong> tokens (
                      {item.pct.toFixed(0)}%)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="m-0 p-3 bg-muted rounded text-xs font-mono whitespace-pre-wrap text-foreground border max-h-75 overflow-y-auto">
                    {item.content}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>

      {/* Output Section */}
      {outputText && (
        <div>
          <div className="flex justify-between items-center text-xs text-muted-foreground mb-2 font-mono">
            <span className="font-semibold">{outputLabel}</span>
            {outputTokens !== undefined && (
              <span>
                Total Output Tokens: <strong>{outputTokens}</strong>
              </span>
            )}
          </div>
          <div className="rounded border-2">
            <pre className="m-0 p-3 bg-muted text-xs font-mono whitespace-pre-wrap text-foreground max-h-62.5 overflow-y-auto">
              {outputText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
