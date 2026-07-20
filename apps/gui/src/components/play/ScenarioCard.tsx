"use client";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

interface ScenarioCardProps {
  name: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ScenarioCard({
  name,
  description,
  onClick,
  disabled,
}: ScenarioCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`shrink-0 w-64 border border-border/30 bg-card p-5 shadow-sm transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed filter grayscale"
          : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm"
      }`}
    >
      <strong className="text-body-md text-foreground block mb-2">
        {name}
      </strong>
      <p className="text-xs text-muted-foreground leading-relaxed mb-1">
        {truncate(description, 80)}
      </p>
      <span
        className={`mt-4 flex items-center justify-center size-7 border font-mono text-sm font-bold ${
          disabled
            ? "border-muted text-muted bg-muted/10"
            : "border-primary bg-primary/10 text-primary"
        }`}
      >
        {">"}
      </span>
    </div>
  );
}
