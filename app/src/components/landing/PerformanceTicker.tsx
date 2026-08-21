"use client";

import { mockMonthlyPerformance } from "@/lib/mock-data";

export default function PerformanceTicker() {
  const data = mockMonthlyPerformance;
  const currentMonth = data[data.length - 1];

  return (
    <div className="w-full bg-muted/80 border-y border-border overflow-hidden">
      <div className="animate-ticker flex items-center gap-8 py-2 whitespace-nowrap">
        {[...data, ...data].map((month, i) => (
          <div key={i} className="flex items-center gap-3 px-4">
            <span className="text-xs text-muted-foreground font-medium">
              {formatMonth(month.month)}
            </span>
            <span
              className={`text-sm font-bold tabular-nums ${
                month.returnPct >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {month.returnPct >= 0 ? "+" : ""}
              {month.returnPct.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {month.totalTrades} trades
            </span>
            <span className="text-gold-500/30">|</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month) - 1]} ${year}`;
}
