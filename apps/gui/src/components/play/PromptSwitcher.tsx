"use client";

interface PromptSwitcherProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  hasActor: boolean;
  hasDecoder: boolean;
  validatorCalls?: { intentIndex: number; intentContent: string }[];
}

export function PromptSwitcher({
  activeTab,
  onTabChange,
  hasActor,
  hasDecoder,
  validatorCalls = [],
}: PromptSwitcherProps) {
  return (
    <div className="flex items-center justify-center gap-4 border-b bg-muted/40 px-6 py-5 overflow-x-auto">
      {/* Primary Pipeline (Linear flow to the left) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onTabChange("actor")}
          disabled={!hasActor}
          className={`flex h-12 w-36 items-center justify-center border-2 text-xs font-semibold uppercase tracking-wider transition-all ${
            activeTab === "actor"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-foreground hover:border-primary/50"
          } disabled:cursor-not-allowed disabled:opacity-40 rounded`}
        >
          Actor Prompt
        </button>

        <span className="text-lg text-muted-foreground">→</span>

        <button
          onClick={() => onTabChange("decoder")}
          disabled={!hasDecoder}
          className={`flex h-12 w-36 items-center justify-center border-2 text-xs font-semibold uppercase tracking-wider transition-all ${
            activeTab === "decoder"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-foreground hover:border-primary/50"
          } disabled:cursor-not-allowed disabled:opacity-40 rounded`}
        >
          Intent Decoder
        </button>
      </div>

      {/* Branching Validator Column to the right of Intent Decoder */}
      {validatorCalls.length > 0 && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg text-muted-foreground">→</span>

          <div className="flex flex-col gap-2 pl-3">
            <div className="flex flex-col gap-2">
              {validatorCalls.map((call) => {
                const tabKey = `validator-${call.intentIndex}`;
                return (
                  <button
                    key={tabKey}
                    onClick={() => onTabChange(tabKey)}
                    className={`flex h-12 w-36 items-center justify-center border-2 text-xs font-semibold uppercase tracking-wider transition-all rounded ${
                      activeTab === tabKey
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                    title={call.intentContent}
                  >
                    LLM Validator (Intent #{call.intentIndex})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
