"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function ScenarioSimulatorPage() {
  const [mode, setMode] = useState<"normal" | "accelerated" | "noisy">("normal");
  const [tempCondition, setTempCondition] = useState<number>(25);
  const [series, setSeries] = useState<{ x: number; y: number }[]>([]);
  const [driftSeries, setDriftSeries] = useState<{ x: number; y: number }[]>([]);
  const [driftStages, setDriftStages] = useState<number[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [drifting, setDrifting] = useState(false);
  const [simulateProgress, setSimulateProgress] = useState(0);
  const [driftProgress, setDriftProgress] = useState(0);
  const [feedback, setFeedback] = useState<string>("Run a simulation to generate trajectory and drift insights.");

  const driftThreshold = 0.5;

  const metrics = useMemo(() => {
    const maxDrift = driftSeries.length > 0 ? Math.max(...driftSeries.map((d) => d.y)) : 0;

    if (series.length === 0) {
      return {
        health: null as number | null,
        riskLabel: "N/A",
        riskClass: "risk-neutral",
        drift: maxDrift,
        drop: null as number | null,
      };
    }

    const start = series[0]?.y ?? 0;
    const end = series[series.length - 1]?.y ?? 0;
    const drop = start > 0 ? ((start - end) / start) * 100 : 0;
    const health = Math.max(0, Math.min(100, 100 - drop * 2.2 - maxDrift * 38));

    let riskLabel = "Low";
    let riskClass = "risk-low";
    if (health < 45 || maxDrift > 1.2) {
      riskLabel = "Critical";
      riskClass = "risk-critical";
    } else if (health < 70 || maxDrift > driftThreshold) {
      riskLabel = "Warning";
      riskClass = "risk-warning";
    }

    return {
      health,
      riskLabel,
      riskClass,
      drift: maxDrift,
      drop,
    };
  }, [series, driftSeries]);

  const insights = useMemo(() => {
    if (series.length === 0) {
      return [
        "No simulation results yet.",
        "Run \"Simulate\" to generate a capacity trajectory.",
        "Run \"Drift Analysis\" to evaluate latent drift risk.",
      ];
    }

    const lines = [
      `Mode selected: ${mode}.`,
      `Temperature condition: ${tempCondition}C.`,
      `Estimated capacity drop: ${metrics.drop?.toFixed(2) ?? "0.00"}%.`,
    ];

    if ((metrics.drift ?? 0) > driftThreshold) {
      lines.push("Latent drift exceeded threshold in part of the sequence.");
    } else {
      lines.push("No abnormal drift spikes detected relative to the threshold.");
    }

    return lines;
  }, [series, mode, tempCondition, metrics.drop, metrics.drift]);

  async function runScenario(): Promise<void> {
    setSimulating(true);
    setSimulateProgress(8);
    setFeedback("Generating synthetic scenario trajectory...");

    const timer = setInterval(() => {
      setSimulateProgress((prev) => (prev >= 94 ? prev : prev + 7));
    }, 300);

    try {
      const res = await fetch(`${API}/model/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: 1, mode, window_size: 50, temp_condition: tempCondition }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }

      const json = await res.json();
      const first = json.trajectories?.[0] || [];
      setSeries(first.map((row: number[], idx: number) => ({ x: idx + 1, y: row[3] ?? 0 })));
      setSimulateProgress(100);
      setFeedback("Scenario simulation complete. Review KPI and trajectory behavior below.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(`Simulation failed: ${msg}`);
    } finally {
      clearInterval(timer);
      setSimulating(false);
    }
  }

  async function runDrift(): Promise<void> {
    setDrifting(true);
    setDriftProgress(8);
    setFeedback("Computing latent drift profile...");

    const timer = setInterval(() => {
      setDriftProgress((prev) => (prev >= 94 ? prev : prev + 8));
    }, 320);

    try {
      const res = await fetch(`${API}/model/drift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_root: "./raw", window_size: 50 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || res.statusText);
      }

      const json = await res.json();
      const stages = Array.isArray(json.stages) ? json.stages : [];
      const points = (json.drift || []).map((d: { distance: number }, i: number) => ({ x: i + 1, y: d.distance }));
      setDriftSeries(points);
      setDriftStages(stages);
      setDriftProgress(100);
      if (points.length === 0 && stages.length <= 1) {
        setFeedback("Drift analysis complete: only one stage was detected, so no stage-to-stage drift distance can be plotted yet.");
      } else if (points.length === 0) {
        setFeedback("Drift analysis complete, but no drift transitions were returned for this dataset.");
      } else {
        setFeedback("Drift analysis complete. Threshold and anomaly points updated.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(`Drift analysis failed: ${msg}`);
    } finally {
      clearInterval(timer);
      setDrifting(false);
    }
  }

  const driftAnomalies = driftSeries.filter((p) => p.y > driftThreshold);

  return (
    <section className="scenario-page">
      <header className="scenario-header card">
        <h1 className="title">Scenario Simulator</h1>
        <p className="subtitle">Design and evaluate normal aging, accelerated degradation, and noisy patterns with temperature-aware simulation and latent drift intelligence.</p>
      </header>

      <div className="scenario-controls card">
        <div className="scenario-controls-grid">
          <div>
            <label className="field-label">⚙️ Scenario Type</label>
            <select className="field" value={mode} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMode(e.target.value as "normal" | "accelerated" | "noisy")}>
              <option value="normal">Normal aging</option>
              <option value="accelerated">Accelerated degradation</option>
              <option value="noisy">Noisy / irregular</option>
            </select>
          </div>
          <div>
            <label className="field-label">🌡️ Temperature</label>
            <div className="temp-field-wrap">
              <input
                className="field"
                type="number"
                value={tempCondition}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTempCondition(Number(e.target.value))}
              />
              <span className="temp-unit">C</span>
            </div>
          </div>
          <div className="scenario-actions">
            <button className="btn secondary" onClick={runScenario} disabled={simulating}>
              {simulating ? "Simulating..." : "Simulate"}
            </button>
            <button className="btn" onClick={runDrift} disabled={drifting}>
              {drifting ? "Analyzing..." : "Drift Analysis"}
            </button>
          </div>
        </div>

        <div className="scenario-progress-grid">
          <div>
            <p className="progress-label">Simulation Progress</p>
            <div className="progress-track"><div className="progress-fill info" style={{ width: `${simulateProgress}%` }} /></div>
          </div>
          <div>
            <p className="progress-label">Drift Progress</p>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${driftProgress}%` }} /></div>
          </div>
        </div>

        <p className="scenario-feedback">{feedback}</p>
      </div>

      <div className="kpi-grid">
        <article className="kpi-card hover-lift">
          <p className="kpi-label">Health Score</p>
          <p className="kpi-value">{metrics.health !== null ? `${metrics.health.toFixed(0)}%` : "--"}</p>
        </article>
        <article className={`kpi-card hover-lift ${metrics.riskClass}`}>
          <p className="kpi-label">Risk Level</p>
          <p className="kpi-value">{metrics.riskLabel}</p>
        </article>
        <article className="kpi-card hover-lift">
          <p className="kpi-label">Drift Score</p>
          <p className="kpi-value">{metrics.drift.toFixed(3)}</p>
        </article>
        <article className="kpi-card hover-lift">
          <p className="kpi-label">Capacity Drop</p>
          <p className="kpi-value">{metrics.drop !== null ? `-${Math.abs(metrics.drop).toFixed(2)}%` : "--"}</p>
        </article>
      </div>

      <div className="scenario-chart-grid">
        <article className="card chart-card fade-in">
          <h3>Scenario Capacity Trajectory</h3>
          <p className="chart-subtitle">Normal vs degraded capacity region with smooth trend line.</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d7d7d7" />
              <XAxis dataKey="x" label={{ value: "Cycle Window", position: "insideBottom", offset: -5 }} />
              <YAxis label={{ value: "Capacity", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Legend />
              <ReferenceArea y1={0} y2={0.18} fill="#fee2e2" fillOpacity={0.4} />
              <ReferenceArea y1={0.18} y2={0.28} fill="#dcfce7" fillOpacity={0.35} />
              <Line type="monotone" dataKey="y" stroke="#f97316" strokeWidth={3} dot={false} name="Capacity Path" />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="card chart-card fade-in">
          <h3>Latent Drift Distance</h3>
          <p className="chart-subtitle">Threshold-aware drift tracking with anomaly point highlights.</p>
          {driftSeries.length === 0 && driftStages.length <= 1 && (
            <p className="small-text">Only one stage detected in current data. Add multi-stage files to visualize transition drift distances.</p>
          )}
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={driftSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d7d7d7" />
              <XAxis dataKey="x" label={{ value: "Stage Transition", position: "insideBottom", offset: -5 }} />
              <YAxis label={{ value: "Drift Distance", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={driftThreshold} stroke="#dc2626" strokeDasharray="6 6" label="Threshold" />
              <Line type="monotone" dataKey="y" stroke="#1d4ed8" strokeWidth={3} dot={false} name="Drift" />
              <Scatter data={driftAnomalies} fill="#dc2626" name="Anomaly Points" />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </div>

      <article className="card insights-card fade-in">
        <h3>📊 Insights</h3>
        <ul>
          {insights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="insight-footer">Expected lifespan estimate updates as more scenario and drift evidence is generated.</p>
      </article>
    </section>
  );
}
