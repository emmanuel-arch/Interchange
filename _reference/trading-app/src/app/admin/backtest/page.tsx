"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, TrendingUp, Target, BarChart3, AlertTriangle } from "lucide-react";
import EquityCurve from "@/components/charts/EquityCurve";
import PnLChart from "@/components/charts/PnLChart";
import { mockBacktestResult, mockPerformanceData } from "@/lib/mock-data";
import { formatPct, formatUSD } from "@/lib/utils";

export default function AdminBacktestPage() {
  const bt = mockBacktestResult;

  const stats = [
    { label: "Total Trades", value: bt.totalTrades, icon: BarChart3, color: "text-blue-400" },
    { label: "Win Rate", value: formatPct(bt.winRate), icon: Target, color: "text-emerald-400" },
    { label: "Profit Factor", value: bt.profitFactor.toFixed(2), icon: TrendingUp, color: "text-gold-400" },
    { label: "Max Drawdown", value: formatPct(bt.maxDrawdown), icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backtest Results</h1>
        <p className="text-muted-foreground text-sm">
          {bt.name} — {new Date(bt.startDate).toLocaleDateString()} to{" "}
          {new Date(bt.endDate).toLocaleDateString()}
        </p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-slate-700/50 bg-slate-900/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Equity curve */}
      <Card className="border-slate-700/50 bg-slate-900/80">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-gold-400" />
              Equity Curve
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="tabular-nums">
                {formatUSD(bt.initialBalance)} → {formatUSD(bt.finalBalance)}
              </Badge>
              <Badge variant="profit" className="tabular-nums">
                +{formatPct(((bt.finalBalance - bt.initialBalance) / bt.initialBalance) * 100)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <EquityCurve data={bt.equityCurve} height={350} />
        </CardContent>
      </Card>

      {/* Monthly returns chart */}
      <Card className="border-slate-700/50 bg-slate-900/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gold-400" />
            Monthly Returns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PnLChart data={mockPerformanceData} height={280} />
        </CardContent>
      </Card>
    </div>
  );
}
