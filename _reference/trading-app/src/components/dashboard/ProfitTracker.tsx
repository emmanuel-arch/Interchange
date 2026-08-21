"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Target } from "lucide-react";
import { mockPerformanceData } from "@/lib/mock-data";
import { formatPct } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

const TARGET_RETURN = 10; // 10% monthly target

const chartData = mockPerformanceData.map((m) => ({
  month: m.month.slice(5), // "2026-03" → "03"
  label: new Date(m.month + "-01").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  }),
  return: m.returnPct,
}));

export default function ProfitTracker() {
  const avgReturn =
    mockPerformanceData.reduce((sum, m) => sum + m.returnPct, 0) /
    mockPerformanceData.length;
  const positiveMonths = mockPerformanceData.filter(
    (m) => m.returnPct > 0
  ).length;

  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gold-400" />
            Monthly Returns
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="gold" className="gap-1 tabular-nums">
              <Target className="w-3 h-3" />
              {TARGET_RETURN}% target
            </Badge>
          </div>
        </div>
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span>
            Avg:{" "}
            <span className="text-foreground font-medium tabular-nums">
              {formatPct(avgReturn)}
            </span>
          </span>
          <span>
            Positive:{" "}
            <span className="text-emerald-400 font-medium tabular-nums">
              {positiveMonths}/{mockPerformanceData.length}
            </span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
            >
              <XAxis
                dataKey="label"
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
                formatter={(value: number) => [
                  `${value.toFixed(2)}%`,
                  "Return",
                ]}
              />
              <ReferenceLine
                y={TARGET_RETURN}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Target",
                  position: "right",
                  fill: "#f59e0b",
                  fontSize: 10,
                }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
              <Bar dataKey="return" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      entry.return >= TARGET_RETURN
                        ? "#22c55e"
                        : entry.return >= 0
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

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground justify-center">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Above target
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gold-500" />
            Positive
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            Negative
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
