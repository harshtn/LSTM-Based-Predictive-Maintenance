"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function BatteryReportPage() {
  const [report, setReport] = useState<any>(null);
  const [comparison, setComparison] = useState<any[]>([]);
  const [message, setMessage] = useState<string>("Generate a report, then export JSON.");
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);

  function buildErrorMessage(prefix: string, err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.toLowerCase().includes("failed to fetch")) {
      return `${prefix}: cannot reach backend API at ${API}. Ensure backend is running on port 4000.`;
    }
    return `${prefix}: ${raw}`;
  }

  async function run(): Promise<void> {
    setLoadingReport(true);
    setMessage("Generating battery report...");
    try {
      const res = await fetch(`${API}/analysis/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw" }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || res.statusText);
      }

      const nextReport = json.report || json;
      setReport(nextReport);
      setMessage("Report generated successfully.");
    } catch (err) {
      setMessage(buildErrorMessage("Generate report failed", err));
    } finally {
      setLoadingReport(false);
    }
  }

  function exportJson(): void {
    if (!report) {
      setMessage("Nothing to export yet. Generate Report first.");
      return;
    }

    const payload = {
      exported_at: new Date().toISOString(),
      report,
      comparison,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = objectUrl;
    link.download = `battery-report-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    setMessage("Exported JSON report successfully.");
  }

  async function loadComparison(): Promise<void> {
    setLoadingComparison(true);
    setMessage("Loading experiment comparison...");
    try {
      const res = await fetch(`${API}/analysis/compare?limit=6`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || res.statusText);
      }

      const items = json.items || [];
      setComparison(items);
      setMessage(items.length > 0 ? `Loaded ${items.length} experiment summaries.` : "No experiment summaries found yet.");
    } catch (err) {
      setMessage(buildErrorMessage("Comparison failed", err));
    } finally {
      setLoadingComparison(false);
    }
  }

  return (
    <section>
      <h1 className="title">Battery Report</h1>
      <button className="btn" onClick={run} disabled={loadingReport || loadingComparison}>
        {loadingReport ? "Generating..." : "Generate Report"}
      </button>
      <button className="btn secondary" onClick={exportJson} disabled={!report || loadingReport || loadingComparison} style={{ marginLeft: 8 }}>
        Export JSON
      </button>
      <button className="btn" onClick={loadComparison} disabled={loadingReport || loadingComparison} style={{ marginLeft: 8 }}>
        {loadingComparison ? "Loading..." : "Compare Experiments"}
      </button>
      <p style={{ marginTop: 10 }}>{message}</p>
      <div className="card" style={{ marginTop: 12 }}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(report, null, 2)}</pre>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Experiment Comparison</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(comparison, null, 2)}</pre>
      </div>
    </section>
  );
}
