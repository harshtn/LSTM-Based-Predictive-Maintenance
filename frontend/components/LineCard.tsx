"use client";

import { Label, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { x: number; y: number };

export function LineCard({
  title,
  data,
  color = "#2d6a4f",
  xLabel,
  yLabel,
}: {
  title: string;
  data: Point[];
  color?: string;
  xLabel?: string;
  yLabel?: string;
}) {
  return (
    <div className="card" style={{ height: 320 }}>
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={data}>
          <XAxis dataKey="x">
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} /> : null}
          </XAxis>
          <YAxis>
            {yLabel ? <Label value={yLabel} angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} /> : null}
          </YAxis>
          <Tooltip />
          <Line dataKey="y" stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
