"use client";

import { useState } from "react";
import { LineCard } from "../../components/LineCard";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function AnomalyPage() {
  const [errorSeries, setErrorSeries] = useState<{ x: number; y: number }[]>([]);
  const [latentSeries, setLatentSeries] = useState<{ x: number; y: number }[]>([]);
  const [anomalySeries, setAnomalySeries] = useState<{ x: number; y: number }[]>([]);
  const [threshold, setThreshold] = useState<string>("");
  const [appliedThreshold, setAppliedThreshold] = useState<number | null>(null);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function detect(): Promise<void> {
    setLoading(true);
    setProgress(8);
    setStatus("Running anomaly detection...");
    setError(null);

    const progressTimer = setInterval(() => {
      setProgress((prev) => (prev >= 92 ? prev : prev + 6));
    }, 350);

    try {
      const payload: { data_root: string; window_size: number; threshold?: number } = {
        data_root: "./raw",
        window_size: 50,
      };

      const t = Number(threshold);
      if (!Number.isNaN(t) && threshold.trim() !== "") {
        payload.threshold = t;
      }

      const res = await fetch(`${API}/model/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }

      const json = await res.json();
      const recon = (json.reconstruction_error || []).map((y: number, x: number) => ({ x, y }));
      const latent = (json.latent_distance || []).map((y: number, x: number) => ({ x, y }));
      const anomalyScore = (json.anomaly_score || []).map((y: number, x: number) => ({ x, y }));
      const labels = json.labels || [];

      setErrorSeries(recon);
      setLatentSeries(latent);
      setAnomalySeries(anomalyScore);
      setAppliedThreshold(typeof json.threshold === "number" ? json.threshold : null);
      setAnomalyCount(labels.filter((v: number) => v === 1).length);
      setProgress(100);
      setStatus("Detection complete.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("Detection failed.");
    } finally {
      clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <section>
      <h1 className="title">Anomaly Detection</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={detect} disabled={loading}>
          {loading ? "Detecting..." : "Run Detection"}
        </button>
        <label htmlFor="threshold" style={{ fontSize: 14, color: "#374151" }}>Threshold (optional)</label>
        <input
          id="threshold"
          type="number"
          step="0.0001"
          placeholder="Auto (95th percentile)"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", minWidth: 180 }}
        />
      </div>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}
      {loading && (
        <div style={{ marginTop: 8, maxWidth: 520 }}>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p style={{ marginTop: 6 }}>{progress}%</p>
        </div>
      )}
      {error && <p style={{ color: "#b91c1c", marginTop: 8 }}>Error: {error}</p>}

      <p style={{ marginTop: 8 }}>
        Applied threshold: {appliedThreshold !== null ? appliedThreshold.toFixed(6) : "n/a"} | Anomalies detected: {anomalyCount}
      </p>

      <div className="grid" style={{ marginTop: 12 }}>
        <LineCard title="Reconstruction Error" data={errorSeries} color="#a4161a" xLabel="Window" yLabel="Error" />
        <LineCard title="Latent Distance" data={latentSeries} color="#1d3557" xLabel="Window" yLabel="Distance" />
        <LineCard title="Anomaly Score" data={anomalySeries} color="#0f766e" xLabel="Window" yLabel="Score" />
      </div>
    </section>
  );
}
