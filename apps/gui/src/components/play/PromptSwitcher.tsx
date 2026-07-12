"use client";

interface PromptSwitcherProps {
  activeTab: "actor" | "decoder";
  onTabChange: (tab: "actor" | "decoder") => void;
  hasActor: boolean;
  hasDecoder: boolean;
  showActorStats: boolean;
  showDecoderStats: boolean;
}

export function PromptSwitcher({
  activeTab,
  onTabChange,
  hasActor,
  hasDecoder,
  showActorStats,
  showDecoderStats,
}: PromptSwitcherProps) {
  return (
    <div className="flex items-center justify-center gap-4 border-b bg-muted/50 px-5 py-4">
      <button
        onClick={() => onTabChange("actor")}
        disabled={!hasActor}
        className={`flex h-14 w-40 items-center justify-center border-2 text-sm font-medium transition-all ${
          activeTab === "actor"
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border/30 bg-card text-foreground hover:border-primary/50"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Actor Prompt
      </button>
      <span className="text-xl text-muted-foreground">→</span>
      <button
        onClick={() => onTabChange("decoder")}
        disabled={!hasDecoder}
        className={`flex h-14 w-44 items-center justify-center border-2 text-sm font-medium transition-all ${
          activeTab === "decoder"
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border/30 bg-card text-foreground hover:border-primary/50"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Intent Decoder
      </button>
    </div>
  );
}
