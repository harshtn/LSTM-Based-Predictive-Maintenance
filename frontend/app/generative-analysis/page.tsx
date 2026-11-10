"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { LineCard } from "../../components/LineCard";
import { ScatterCard } from "../../components/ScatterCard";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function GenerativeAnalysisPage() {
  const [series, setSeries] = useState<{ x: number; y: number }[]>([]);
  const [latentCount, setLatentCount] = useState<number>(0);
  const [latentPoints, setLatentPoints] = useState<{ x: number; y: number }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [runningLatent, setRunningLatent] = useState(false);
  const [runningInterpolation, setRunningInterpolation] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [latentProgress, setLatentProgress] = useState(0);
  const [interpolationProgress, setInterpolationProgress] = useState(0);
  const [generateFeedback, setGenerateFeedback] = useState("");
  const [latentFeedback, setLatentFeedback] = useState("");
  const [interpolationFeedback, setInterpolationFeedback] = useState("");

  function startProgress(setter: Dispatch<SetStateAction<number>>): ReturnType<typeof setInterval> {
    setter(5);
    return setInterval(() => {
      setter((prev) => (prev >= 92 ? prev : prev + 8));
    }, 350);
  }

  async function generate(): Promise<void> {
    setGenerating(true);
    setGenerateFeedback("Generating synthetic trajectory...");
    const timer = startProgress(setGenerateProgress);
    try {
      const res = await fetch(`${API}/model/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: 1, mode: "normal", window_size: 50 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }
      const json = await res.json();
      const first = json.trajectories?.[0] || [];
      setSeries(first.map((row: number[], idx: number) => ({ x: idx, y: row[3] ?? 0 })));
      setGenerateProgress(100);
      setGenerateFeedback(`Synthetic trajectory generated (${first.length} points).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenerateFeedback(`Generation failed: ${msg}`);
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  async function runLatent(): Promise<void> {
    setRunningLatent(true);
    setLatentFeedback("Running latent PCA projection...");
    const timer = startProgress(setLatentProgress);
    try {
      const res = await fetch(`${API}/model/latent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw", window_size: 50, method: "pca" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }
      const json = await res.json();
      const pts = (json.points || []).map((p: number[]) => ({ x: p[0], y: p[1] }));
      setLatentPoints(pts);
      setLatentCount(pts.length);
      setLatentProgress(100);
      setLatentFeedback(`Latent PCA completed (${pts.length} points).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLatentFeedback(`Latent PCA failed: ${msg}`);
    } finally {
      clearInterval(timer);
      setRunningLatent(false);
    }
  }

  async function runInterpolation(): Promise<void> {
    setRunningInterpolation(true);
    setInterpolationFeedback("Interpolating latent trajectory...");
    const timer = startProgress(setInterpolationProgress);
    try {
      const res = await fetch(`${API}/model/interpolate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: 20 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }
      const json = await res.json();
      const first = json.trajectories?.[0] || [];
      setSeries(first.map((row: number[], idx: number) => ({ x: idx, y: row[3] ?? 0 })));
      setInterpolationProgress(100);
      setInterpolationFeedback(`Interpolation complete (${first.length} points).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInterpolationFeedback(`Interpolation failed: ${msg}`);
    } finally {
      clearInterval(timer);
      setRunningInterpolation(false);
    }
  }

  return (
    <section>
      <h1 className="title">Generative Analysis</h1>
      <button className="btn" onClick={generate} disabled={generating}>
        {generating ? "Generating..." : "Generate Synthetic Trajectory"}
      </button>
      <button className="btn secondary" onClick={runLatent} style={{ marginLeft: 8 }} disabled={runningLatent}>
        {runningLatent ? "Running PCA..." : "Run Latent PCA"}
      </button>
      <button className="btn" onClick={runInterpolation} style={{ marginLeft: 8 }} disabled={runningInterpolation}>
        {runningInterpolation ? "Interpolating..." : "Interpolate"}
      </button>

      <div style={{ marginTop: 12 }}>
        <p style={{ marginBottom: 4 }}>Generate: {generateFeedback || "Idle"}</p>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" style={{ maxWidth: 520 }}>
          <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${generateProgress}%` }} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <p style={{ marginBottom: 4 }}>Latent PCA: {latentFeedback || "Idle"}</p>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" style={{ maxWidth: 520 }}>
          <div className="bg-emerald-600 h-full rounded-full transition-all duration-300" style={{ width: `${latentProgress}%` }} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <p style={{ marginBottom: 4 }}>Interpolate: {interpolationFeedback || "Idle"}</p>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" style={{ maxWidth: 520 }}>
          <div className="bg-orange-500 h-full rounded-full transition-all duration-300" style={{ width: `${interpolationProgress}%` }} />
        </div>
      </div>

      <p>Latent points generated: {latentCount}</p>
      <div className="grid" style={{ marginTop: 12 }}>
        <LineCard title="Generated Capacity Path" data={series} color="#ff7f11" />
        <ScatterCard title="Latent Space Projection (PCA)" data={latentPoints} color="#1d3557" />
      </div>
    </section>
  );
}
