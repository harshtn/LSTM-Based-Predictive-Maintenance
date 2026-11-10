"use client";

import { useState } from "react";
import { LineCard } from "../../components/LineCard";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function DataExplorerPage() {
  const [capacity, setCapacity] = useState<{ x: number; y: number }[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadData(): Promise<void> {
    setLoading(true);
    setProgress(3);
    setStatus("Starting trajectory load...");
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 130000);

    let direction = 1;
    let elapsed = 0;

    // Keep progress moving while backend computes trajectory windows.
    const progressTimer = setInterval(() => {
      elapsed += 0.4;
      if (elapsed > 10 && elapsed <= 30) {
        setStatus("Scanning cycles and stages...");
      } else if (elapsed > 30 && elapsed <= 70) {
        setStatus("Generating capacity trajectory...");
      } else if (elapsed > 70) {
        setStatus("Finalizing chart data...");
      }

      setProgress((prev) => {
        if (prev < 88) {
          return prev + 2;
        }

        // Avoid a frozen-looking bar near completion by oscillating slightly.
        if (prev >= 95) direction = -1;
        if (prev <= 89) direction = 1;
        return prev + direction;
      });
    }, 400);

    try {
      const res = await fetch(`${API}/model/trajectory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw", window_size: 50 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }

      const json = await res.json();
      setCapacity(json.capacity_curve || []);
      setMeta(json.meta || null);
      setProgress(100);
      setStatus("Trajectory loaded successfully.");
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out after 130s. Try reducing data size or window_size."
          : err instanceof Error
          ? err.message
          : String(err);
      setError(msg);
      setStatus("Load failed.");
    } finally {
      clearTimeout(timeout);
      clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <section>
      <h1 className="title">Data Explorer</h1>
      <button className="btn" onClick={loadData} disabled={loading}>
        {loading ? "Loading..." : "Load Stage Trajectory"}
      </button>
      {status && <p>{status}</p>}
      {loading && (
        <div style={{ marginTop: 8, maxWidth: 420 }}>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p style={{ marginTop: 6 }}>{progress}%</p>
        </div>
      )}
      {error && <p style={{ color: "#b91c1c" }}>Error: {error}</p>}
      <p>Stages seen: {(meta?.stages_seen || []).join(", ") || "n/a"}</p>
      <div className="grid">
        <LineCard title="Capacity vs Cycle" data={capacity} xLabel="Cycle" yLabel="Capacity" />
      </div>
    </section>
  );
}
