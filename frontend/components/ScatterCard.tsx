"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

type Point = { x: number; y: number };

export function ScatterCard({ title, data, color = "#2d6a4f" }: { title: string; data: Point[]; color?: string }) {
  return (
    <div className="card" style={{ height: 320 }}>
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height="88%">
        <ScatterChart>
          <CartesianGrid />
          <XAxis dataKey="x" />
          <YAxis dataKey="y" />
          <Tooltip />
          <Scatter data={data} fill={color} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
