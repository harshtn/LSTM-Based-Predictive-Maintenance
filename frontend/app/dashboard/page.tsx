"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import TrainingProgress from "@/components/TrainingProgress";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function formatNetworkAwareError(prefix: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.toLowerCase().includes("failed to fetch")) {
    return `${prefix}: cannot reach backend API at ${API}. Ensure backend is running on port 4000.`;
  }
  return `${prefix}: ${raw}`;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [showProgress, setShowProgress] = useState(false);

  async function uploadDataset(file: File): Promise<void> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setMessage(`Uploaded: ${json.originalName || file.name}`);
  }

  async function trainModel(): Promise<void> {
    setLoading(true);
    setShowProgress(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/model/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw", window_size: 50, epochs: 10 }),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(`Training failed: ${error.error || res.statusText}`);
        setShowProgress(false);
        return;
      }

      const json = await res.json();
      if (json.error) {
        setMessage(`Training failed: ${json.error}`);
        setShowProgress(false);
      } else {
        const epochsDone = json?.training?.history?.length || 0;
        setMessage(`Training complete: ${epochsDone} epochs. Running health analysis...`);
        await runHealth(true);
      }
    } catch (err) {
      console.error("Training error:", err);
      setMessage(formatNetworkAwareError("Training failed", err));
      setShowProgress(false);
    } finally {
      setLoading(false);
    }
  }

  async function runHealth(fromTraining: boolean = false): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`${API}/analysis/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw" }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message || res.statusText);
      }
      const json = await res.json();
      setHealth(json.report || json);
      if (fromTraining) {
        setMessage("Training complete and health insights updated.");
      }
    } catch (err) {
      setMessage(formatNetworkAwareError("Analysis failed", err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TrainingProgress visible={showProgress} onComplete={() => setShowProgress(false)} />
      <section>
        <h1 className="title">Dashboard</h1>
        <div className="grid">
          <div className="card">
            <h3>Health Score</h3>
            <div className="metric">{health?.health_score ?? "--"}</div>
            <p>Risk: {health?.risk_level ?? "n/a"}</p>
            <button className="btn" onClick={() => void runHealth()} disabled={loading}>
              {loading ? "Running..." : "Run Analysis"}
            </button>
          </div>
          <div className="card">
            <h3>Dataset Upload</h3>
            <input
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (file) {
                  void uploadDataset(file);
                }
              }}
            />
            <button className="btn secondary" onClick={trainModel} disabled={loading} style={{ marginTop: 8 }}>
              Train LSTM-VAE
            </button>
            <p>{message}</p>
          </div>
          <div className="card">
            <h3>Quick Insights</h3>
            <p>Remaining cycles: {health?.remaining_cycles ?? "--"}</p>
            <p>Anomalies detected: {health?.anomalies_detected ?? "--"}</p>
            <ul>
              {(health?.recommendations || ["Upload and analyze data"]).map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
