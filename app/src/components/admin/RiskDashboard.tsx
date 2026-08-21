"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { formatPct } from "@/lib/utils";
import type { RiskMetrics } from "@/types";

interface Props {
  metrics: RiskMetrics;
}

export default function RiskDashboard({ metrics }: Props) {
  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-gold-400" />
          Risk Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Daily P&L"
            value={formatPct(metrics.dailyPnlPct)}
            positive={metrics.dailyPnlPct >= 0}
          />
          <MetricCard
            label="Weekly P&L"
            value={formatPct(metrics.weeklyPnlPct)}
            positive={metrics.weeklyPnlPct >= 0}
          />
          <MetricCard
            label="Drawdown"
            value={formatPct(-metrics.drawdownFromPeak)}
            positive={false}
          />
          <MetricCard
            label="Trades Left Today"
            value={`${metrics.tradesRemainingToday}/${metrics.maxDailyTrades}`}
          />
        </div>

        {/* Fortress rules */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">
            Fortress Rules
          </h4>
          <div className="space-y-2">
            {metrics.fortressRules.map((rule) => {
              const pct =
                rule.threshold > 0
                  ? (Math.abs(rule.currentValue) / rule.threshold) * 100
                  : 0;

              return (
                <div
                  key={rule.name}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50"
                >
                  {rule.status === "TRIGGERED" ? (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  ) : rule.status === "ACTIVE" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {rule.name}
                      </span>
                      <Badge
                        variant={
                          rule.status === "TRIGGERED"
                            ? "destructive"
                            : rule.status === "ACTIVE"
                            ? "online"
                            : "pending"
                        }
                        className="text-[10px]"
                      >
                        {rule.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {rule.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct > 80
                              ? "bg-red-500"
                              : pct > 50
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {rule.currentValue} / {rule.threshold}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-800/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums ${
          positive === undefined
            ? "text-foreground"
            : positive
            ? "text-emerald-400"
            : "text-red-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
