"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, TrendingDown,
  DollarSign, BarChart3, Lock, Target
} from "lucide-react"
import { generateRiskState, generateDailySummaries } from "@/lib/trading-mock-data"

export default function RiskPage() {
  const risk = useMemo(() => generateRiskState(), [])
  const dailySummaries = useMemo(() => generateDailySummaries(14), [])

  const totalScore = risk.rules.filter((r) => r.status === "OK").length
  const maxScore = risk.rules.length
  const healthPct = (totalScore / maxScore) * 100

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <Shield className="w-7 h-7 text-amber-500" />
          Risk Fortress
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          7 Iron Rules protecting your capital — FTMO compliant
        </p>
      </div>

      {/* Health Score */}
      <Card className="bg-card border-border">
        <CardContent className="py-6">
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
                <circle
                  cx="50" cy="50" r="42" fill="none" strokeWidth="6"
                  strokeDasharray={`${healthPct * 2.64} ${264 - healthPct * 2.64}`}
                  strokeLinecap="round"
                  className={healthPct >= 85 ? "text-green-500" : healthPct >= 60 ? "text-amber-500" : "text-red-500"}
                  stroke="currentColor"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-mono font-bold text-foreground">{totalScore}/{maxScore}</span>
                <span className="text-[9px] font-mono text-muted-foreground">RULES OK</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-sm font-mono font-semibold text-foreground">Capital Protection Status</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniKpi label="Balance" value={`$${risk.currentBalance.toLocaleString()}`} />
                <MiniKpi label="Peak" value={`$${risk.peakBalance.toLocaleString()}`} />
                <MiniKpi label="Drawdown" value={`${risk.currentDrawdownPct.toFixed(2)}%`} color={risk.currentDrawdownPct > 5 ? "text-red-500" : "text-green-500"} />
                <MiniKpi label="Daily P&L" value={`${risk.dailyPnl >= 0 ? "+" : ""}$${risk.dailyPnl.toFixed(2)}`} color={risk.dailyPnl >= 0 ? "text-green-500" : "text-red-500"} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7 Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {risk.rules.map((rule) => (
          <Card
            key={rule.id}
            className={`bg-card border transition-all ${
              rule.status === "BREACHED"
                ? "border-red-500/50 bg-red-500/5"
                : rule.status === "WARNING"
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-border"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {rule.status === "OK" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : rule.status === "WARNING" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className="text-sm font-mono font-semibold text-foreground">{rule.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono ${
                    rule.status === "OK"
                      ? "text-green-400 border-green-400/30"
                      : rule.status === "WARNING"
                      ? "text-amber-400 border-amber-400/30"
                      : "text-red-400 border-red-400/30"
                  }`}
                >
                  {rule.status}
                </Badge>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mb-3">{rule.description}</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Current</span>
                  <span className="text-foreground">{rule.currentValue.toFixed(2)} {rule.unit}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      rule.status === "OK" ? "bg-green-500" : rule.status === "WARNING" ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min((rule.currentValue / rule.threshold) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Limit</span>
                  <span className="text-muted-foreground">{rule.threshold} {rule.unit}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily Performance History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            14-Day Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-normal">Date</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-normal">Trades</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-normal">W/L</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-normal">Win%</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-normal">P&L</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-normal">DD%</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {dailySummaries.map((d) => (
                  <tr key={d.date} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-2 text-foreground">{d.date}</td>
                    <td className="py-2 px-2 text-center text-foreground">{d.tradesCount}</td>
                    <td className="py-2 px-2 text-center">
                      <span className="text-green-500">{d.wins}</span>/<span className="text-red-500">{d.losses}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-foreground">{d.winRate.toFixed(0)}%</td>
                    <td className={`py-2 px-2 text-right font-semibold ${d.grossPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {d.grossPnl >= 0 ? "+" : ""}${d.grossPnl.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right text-amber-500">{d.maxDrawdownPct.toFixed(2)}%</td>
                    <td className="py-2 px-2 text-right text-foreground">${d.endingBalance.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MiniKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-mono font-semibold ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground uppercase">{label}</div>
    </div>
  )
}
