import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>Omnia GUI</h1>
      <p className="subtitle">
        Configuration and gameplay interface for the Omnia simulation engine.
      </p>
      <div className="home-links">
        <Link href="/play" className="home-card">
          <h2>Play</h2>
          <p>Start a simulation and interact with NPCs</p>
        </Link>
        <Link href="/config" className="home-card">
          <h2>Config</h2>
          <p>Check environment, API keys, and available scenarios</p>
        </Link>
      </div>
      <style>{`
        .home {
          max-width: 800px;
          margin: 0 auto;
          padding: 3rem 1rem;
        }
        .home h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        .subtitle {
          color: #555;
          margin-bottom: 2rem;
        }
        .home-links {
          display: flex;
          gap: 1rem;
        }
        .home-card {
          flex: 1;
          display: block;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .home-card:hover {
          border-color: #2563eb;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1);
        }
        .home-card h2 {
          font-size: 1.25rem;
          margin-bottom: 0.25rem;
        }
        .home-card p {
          font-size: 0.875rem;
          color: #555;
        }
      `}</style>
    </main>
  );
}
