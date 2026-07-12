import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto max-w-[800px] px-10 py-12">
      <h1 className="mb-2 text-headline-lg text-primary">Omnia GUI</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Configuration and gameplay interface for the Omnia simulation engine.
      </p>
      <div className="flex gap-6">
        <Link href="/play" className="flex-1 no-underline text-foreground">
          <Card className="transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--border)]">
            <CardHeader>
              <CardTitle>Play</CardTitle>
              <CardDescription>
                Start a simulation and interact with NPCs
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/config" className="flex-1 no-underline text-foreground">
          <Card className="transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--border)]">
            <CardHeader>
              <CardTitle>Config</CardTitle>
              <CardDescription>
                Check environment, API keys, and available scenarios
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </main>
  );
}
