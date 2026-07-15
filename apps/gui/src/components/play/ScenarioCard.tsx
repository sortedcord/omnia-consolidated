"use client";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

interface ScenarioCardProps {
  name: string;
  description: string;
  onClick: () => void;
}

export function ScenarioCard({
  name,
  description,
  onClick,
}: ScenarioCardProps) {
  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-64 border border-border/30 bg-card p-5 cursor-pointer shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm transition-all"
    >
      <strong className="text-body-md text-foreground block mb-2">
        {name}
      </strong>
      <p className="text-xs text-muted-foreground leading-relaxed mb-1">
        {truncate(description, 80)}
      </p>
      <span className="mt-4 flex items-center justify-center size-7 border border-primary bg-primary/10 text-primary font-mono text-sm font-bold">
        {">"}
      </span>
    </div>
  );
}
