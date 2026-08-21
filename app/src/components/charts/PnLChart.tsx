"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { MonthlyPerformance } from "@/types";

interface PnLChartProps {
  data: MonthlyPerformance[];
  height?: number;
  showTarget?: boolean;
  targetPct?: number;
}

export default function PnLChart({
  data,
  height = 280,
  showTarget = true,
  targetPct = 10,
}: PnLChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No performance data available
      </div>
    );
  }

  const chartData = data.map((m) => ({
    month: new Date(m.month + "-01").toLocaleDateString("en-US", {
      month: "short",
    }),
    returnPct: m.returnPct,
    pnlUSD: m.pnlUSD,
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, bottom: 5, left: 0 }}
        >
          <XAxis
            dataKey="month"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: number, name: string) => {
              if (name === "returnPct") {
                return [`${value.toFixed(2)}%`, "Return"];
              }
              return [`$${value.toLocaleString()}`, "P&L"];
            }}
          />
          {showTarget && (
            <ReferenceLine
              y={targetPct}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${targetPct}% Target`,
                position: "right",
                fill: "#f59e0b",
                fontSize: 10,
              }}
            />
          )}
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
          <Bar dataKey="returnPct" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {chartData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={
                  entry.returnPct >= targetPct
                    ? "#22c55e"
                    : entry.returnPct >= 0
                    ? "#f59e0b"
                    : "#ef4444"
                }
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
