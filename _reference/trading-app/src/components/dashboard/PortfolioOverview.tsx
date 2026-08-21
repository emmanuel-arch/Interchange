"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { mockInvestorAccount, mockDashboardStats } from "@/lib/mock-data";
import { formatUSD, formatPct } from "@/lib/utils";

const metrics = [
  {
    label: "Starting Capital",
    value: formatUSD(mockInvestorAccount.startingCapital),
    icon: Wallet,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  {
    label: "Current Value",
    value: formatUSD(mockInvestorAccount.currentValue),
    icon: DollarSign,
    color: "text-gold-400",
    bgColor: "bg-gold-400/10",
    change: mockInvestorAccount.totalReturn,
    changeDirection: mockInvestorAccount.totalReturn >= 0 ? "up" : "down",
  },
  {
    label: "Total Return",
    value: formatPct(mockInvestorAccount.totalReturn),
    icon: TrendingUp,
    color:
      mockInvestorAccount.totalReturn >= 0
        ? "text-emerald-400"
        : "text-red-400",
    bgColor:
      mockInvestorAccount.totalReturn >= 0
        ? "bg-emerald-400/10"
        : "bg-red-400/10",
  },
  {
    label: "This Month P&L",
    value: formatUSD(mockDashboardStats.monthlyPnl),
    icon: BarChart3,
    color:
      mockDashboardStats.monthlyPnl >= 0
        ? "text-emerald-400"
        : "text-red-400",
    bgColor:
      mockDashboardStats.monthlyPnl >= 0
        ? "bg-emerald-400/10"
        : "bg-red-400/10",
    change: mockDashboardStats.monthlyReturn,
    changeDirection: mockDashboardStats.monthlyReturn >= 0 ? "up" : "down",
  },
];

export default function PortfolioOverview() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <Card
          key={m.label}
          className="border-slate-700/50 bg-slate-900/80 hover:border-gold-500/30 transition-all duration-300"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {m.label}
                </p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {m.value}
                </p>
                {m.change !== undefined && (
                  <div className="flex items-center gap-1 text-xs">
                    {m.changeDirection === "up" ? (
                      <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 text-red-400" />
                    )}
                    <span
                      className={
                        m.changeDirection === "up"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {formatPct(Math.abs(m.change))}
                    </span>
                  </div>
                )}
              </div>
              <div className={`p-2 rounded-lg ${m.bgColor}`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
