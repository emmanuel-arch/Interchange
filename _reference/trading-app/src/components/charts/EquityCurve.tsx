"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { EquityPoint } from "@/types";

interface EquityCurveProps {
  data: EquityPoint[];
  height?: number;
  showGrid?: boolean;
}

export default function EquityCurve({
  data,
  height = 300,
  showGrid = true,
}: EquityCurveProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No equity data available
      </div>
    );
  }

  const minEquity = Math.min(...data.map((d) => d.equity));
  const maxEquity = Math.max(...data.map((d) => d.equity));
  const yDomain = [
    Math.floor(minEquity * 0.98),
    Math.ceil(maxEquity * 1.02),
  ];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `$${val.toLocaleString()}`}
            width={65}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: number) => [
              `$${value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}`,
              "Equity",
            ]}
            labelFormatter={(label) =>
              new Date(label).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#equityGradient)"
            dot={false}
            activeDot={{
              r: 4,
              fill: "#f59e0b",
              stroke: "#0f172a",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
