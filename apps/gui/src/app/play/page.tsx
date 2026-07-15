"use client";

import { PlayView } from "@/components/play/PlayView";
import { Suspense } from "react";

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin text-primary">Loading...</div>
        </div>
      }
    >
      <PlayView />
    </Suspense>
  );
}
