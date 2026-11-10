"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function ExperimentComparisonPage() {
  const [items, setItems] = useState<any[]>([]);

  async function load(): Promise<void> {
    const res = await fetch(`${API}/analysis/compare?limit=12`);
    const json = await res.json();
    setItems(json.items || []);
  }

  return (
    <section>
      <h1 className="title">Experiment Comparison Dashboard</h1>
      <button className="btn" onClick={load}>Load Comparison</button>
      <div className="card" style={{ marginTop: 12 }}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(items, null, 2)}</pre>
      </div>
    </section>
  );
}
