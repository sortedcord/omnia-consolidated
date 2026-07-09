"use client";

import { useEffect, useState } from "react";
import { getConfigStatus } from "@/app/play/actions";

interface ConfigStatus {
  apiKeySet: boolean;
  apiKeyPreview: string;
  model: string;
  availableScenarios: { path: string; name: string }[];
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await getConfigStatus();
        if (!cancelled) {
          setConfig(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="config-page">
      <h1>Configuration</h1>

      {loading && <p>Loading configuration...</p>}
      {error && <div className="error-banner">{error}</div>}

      {config && !loading && (
        <>
          <section className="config-section">
            <h2>LLM Provider</h2>
            <div className="config-row">
              <span className="config-label">Provider</span>
              <span className="config-value">Google Gemini</span>
            </div>
            <div className="config-row">
              <span className="config-label">Model</span>
              <span className="config-value">
                <code>{config.model}</code>
              </span>
            </div>
            <div className="config-row">
              <span className="config-label">API Key</span>
              <span
                className={
                  config.apiKeySet
                    ? "config-value status-ok"
                    : "config-value status-error"
                }
              >
                {config.apiKeySet
                  ? `✓ Set (${config.apiKeyPreview})`
                  : "✗ NOT SET"}
              </span>
            </div>
            {!config.apiKeySet && (
              <div className="config-hint">
                Add <code>GOOGLE_API_KEY=your_key</code> to the{" "}
                <code>.env</code> file in the project root, then restart the
                server.
              </div>
            )}
          </section>

          <section className="config-section">
            <h2>Available Scenarios</h2>
            {config.availableScenarios.length === 0 ? (
              <p className="config-hint">
                No scenarios found in{" "}
                <code>content/demo/scenarios/</code>.
              </p>
            ) : (
              <table className="scenario-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {config.availableScenarios.map((s) => (
                    <tr key={s.path}>
                      <td>{s.name}</td>
                      <td>
                        <code>{s.path}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="config-section">
            <h2>Engine Packages</h2>
            <p className="config-hint">
              All <code>@omnia/*</code> workspace packages are consumed via{" "}
              <code>transpilePackages</code> in <code>next.config.ts</code>.
              The native <code>better-sqlite3</code> module is externalized via{" "}
              <code>serverExternalPackages</code>.
            </p>
          </section>
        </>
      )}

      <style>{`
        .config-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }
        .config-page h1 {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .config-section {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .config-section h2 {
          font-size: 1.125rem;
          margin-bottom: 0.75rem;
        }
        .config-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .config-label {
          color: #555;
          font-size: 0.875rem;
        }
        .config-value {
          font-size: 0.875rem;
        }
        .status-ok {
          color: #16a34a;
        }
        .status-error {
          color: #dc2626;
          font-weight: 500;
        }
        .config-hint {
          margin-top: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 4px;
          font-size: 0.8125rem;
          color: #92400e;
        }
        .config-hint code {
          background: rgba(0,0,0,0.06);
          padding: 0.125rem 0.25rem;
          border-radius: 2px;
          font-size: 0.75rem;
        }
        .error-banner {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          border-radius: 4px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .scenario-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .scenario-table th {
          text-align: left;
          padding: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
          color: #555;
          font-weight: 500;
        }
        .scenario-table td {
          padding: 0.5rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .scenario-table code {
          font-size: 0.8125rem;
          color: #2563eb;
        }
        code {
          font-family: monospace;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
