"use client";

import { Button } from "@/components/ui/button";

interface JsonTabProps {
  compiledScenario: Record<string, unknown>;
  onCopySuccess: () => void;
}

export function JsonTab({ compiledScenario, onCopySuccess }: JsonTabProps) {
  return (
    <div className="flex-1 flex flex-col border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] min-h-[400px]">
      <div className="flex justify-between items-center border-b border-border/20 pb-3 mb-4">
        <h2 className="text-body-lg text-primary font-bold">
          Scenario JSON Code Output
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(
                JSON.stringify(compiledScenario, null, 2)
              );
              onCopySuccess();
            }}
            className="h-8 text-xs cursor-pointer"
          >
            Copy to Clipboard
          </Button>
        </div>
      </div>
      <pre className="flex-1 bg-black/40 border border-border/10 p-4 rounded overflow-auto font-mono text-xs text-emerald-400 select-text leading-relaxed">
        {JSON.stringify(compiledScenario, null, 2)}
      </pre>
    </div>
  );
}
