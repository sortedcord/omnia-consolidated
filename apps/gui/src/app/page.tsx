import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-[800px] px-4 py-12">
      <h1 className="mb-2 text-3xl">Omnia GUI</h1>
      <p className="mb-8 text-gray-500">
        Configuration and gameplay interface for the Omnia simulation engine.
      </p>
      <div className="flex gap-4">
        <Link
          href="/play"
          className="block flex-1 rounded-lg border border-gray-200 p-6 text-inherit no-underline transition-[border-color,box-shadow] duration-150 hover:border-blue-600 hover:shadow-[0_2px_8px_rgba(37,99,235,0.1)]"
        >
          <h2 className="mb-1 text-xl">Play</h2>
          <p className="text-sm text-gray-500">
            Start a simulation and interact with NPCs
          </p>
        </Link>
        <Link
          href="/config"
          className="block flex-1 rounded-lg border border-gray-200 p-6 text-inherit no-underline transition-[border-color,box-shadow] duration-150 hover:border-blue-600 hover:shadow-[0_2px_8px_rgba(37,99,235,0.1)]"
        >
          <h2 className="mb-1 text-xl">Config</h2>
          <p className="text-sm text-gray-500">
            Check environment, API keys, and available scenarios
          </p>
        </Link>
      </div>
    </main>
  );
}
