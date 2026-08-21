"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Activity, Zap, Shield, TrendingUp, TrendingDown, AlertTriangle,
  Power, PowerOff, Heart, Radio, Clock, DollarSign, Target,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus, Eye, Terminal
} from "lucide-react"
import Link from "next/link"
import {
  generateDashboardStats, generateHeartbeat, generateLiveConditions,
  generateAlert, generateTradeHistory, generateRiskState
} from "@/lib/trading-mock-data"
import type { DashboardStats, Heartbeat, LiveConditions, PlatformAlert, Trade } from "@/lib/trading-types"

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(generateDashboardStats())
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([])
  const [conditions, setConditions] = useState<LiveConditions>(generateLiveConditions())
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])
  const risk = useMemo(() => generateRiskState(), [])

  // Heartbeat stream — every 5 seconds
  useEffect(() => {
    const hb = generateHeartbeat()
    setHeartbeats([hb])

    const interval = setInterval(() => {
      const beat = generateHeartbeat()
      setHeartbeats((prev) => [beat, ...prev].slice(0, 20))
      setStats(generateDashboardStats())
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Conditions — every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      setConditions(generateLiveConditions())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Alerts — occasional
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        setAlerts((prev) => [generateAlert(), ...prev].slice(0, 10))
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Initial trades
  useEffect(() => {
    setRecentTrades(generateTradeHistory(5))
  }, [])

  const latestHb = heartbeats[0]
  const isOnline = latestHb?.status === "ONLINE"

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Cockpit Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Zap className="w-7 h-7 text-amber-500" />
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            GoldStrike v2.0 — {stats.currentSession !== "OFF" ? `${stats.currentSession} Session Active` : "Markets Closed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Engine Status Beacon */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
            <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-xs font-mono text-foreground">{isOnline ? "ENGINE ONLINE" : "ENGINE OFFLINE"}</span>
          </div>
          {/* Kill Switch */}
          <Button
            variant={stats.killSwitch === "OFF" ? "outline" : "destructive"}
            size="sm"
            className="gap-2 font-mono text-xs"
          >
            {stats.killSwitch === "OFF" ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            {stats.killSwitch === "OFF" ? "KILL SWITCH" : "⚠ HALTED"}
          </Button>
          {/* Heartbeat indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card">
            <Heart className={`w-3.5 h-3.5 ${latestHb && latestHb.latencyMs < 60 ? "text-green-500" : "text-amber-500"}`} />
            <span className="text-xs font-mono text-muted-foreground">
              {latestHb ? `${latestHb.latencyMs}ms` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Balance"
          value={`$${stats.balance.toLocaleString()}`}
          icon={DollarSign}
          color="text-foreground"
        />
        <KpiCard
          label="Today P&L"
          value={`${stats.todayPnl >= 0 ? "+" : ""}$${stats.todayPnl.toFixed(2)}`}
          sub={`${stats.todayPnlPct >= 0 ? "+" : ""}${stats.todayPnlPct.toFixed(2)}%`}
          icon={stats.todayPnl >= 0 ? TrendingUp : TrendingDown}
          color={stats.todayPnl >= 0 ? "text-green-500" : "text-red-500"}
        />
        <KpiCard
          label="Week P&L"
          value={`${stats.weekPnl >= 0 ? "+" : ""}$${stats.weekPnl.toFixed(2)}`}
          sub={`${stats.weekPnlPct >= 0 ? "+" : ""}${stats.weekPnlPct.toFixed(2)}%`}
          icon={stats.weekPnl >= 0 ? TrendingUp : TrendingDown}
          color={stats.weekPnl >= 0 ? "text-green-500" : "text-red-500"}
        />
        <KpiCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          icon={Target}
          color="text-amber-500"
        />
        <KpiCard
          label="Trades Today"
          value={`${stats.tradesToday}/${stats.maxTradesToday}`}
          icon={BarChart3}
          color="text-blue-500"
        />
        <KpiCard
          label="Open Positions"
          value={`${stats.openPositions}`}
          icon={Radio}
          color={stats.openPositions > 0 ? "text-green-500" : "text-muted-foreground"}
        />
      </div>

      {/* Main Grid: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Live Conditions Mini */}
        <Card className="col-span-1 lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-500" />
                Live Condition Monitor
              </CardTitle>
              <Link href="/dashboard/live">
                <Button variant="ghost" size="sm" className="text-xs gap-1 font-mono text-muted-foreground">
                  <Eye className="w-3 h-3" /> Full View
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black/40 rounded-lg p-4 font-mono text-xs space-y-1 max-h-[280px] overflow-y-auto">
              <div className="text-muted-foreground">
                Bid: <span className="text-foreground">{conditions.bid.toFixed(3)}</span> | Spread:{" "}
                <span className={conditions.spread <= 0.4 ? "text-green-400" : "text-red-400"}>
                  ${conditions.spread.toFixed(3)}
                </span>{" "}
                | Session: <span className="text-amber-400">{conditions.session}</span>
              </div>
              <div className="border-t border-border/30 my-2" />
              {conditions.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className={
                      c.status === "PASS"
                        ? "text-green-400"
                        : c.status === "FAIL"
                        ? "text-red-400"
                        : "text-amber-400"
                    }
                  >
                    [{c.status}]
                  </span>
                  <span className="text-muted-foreground">{c.name}:</span>
                  <span className="text-foreground">{c.value}</span>
                  <span className="text-muted-foreground/70">{c.detail}</span>
                </div>
              ))}
              <div className="border-t border-border/30 my-2" />
              <div className="text-foreground">
                Conditions: <span className="text-amber-400">{conditions.conditionsMet}/{conditions.conditionsTotal}</span>{" "}
                met | Blocked by:{" "}
                <span className="text-red-400">{conditions.blockedBy.join(", ") || "None"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Risk Snapshot */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                Risk Fortress
              </CardTitle>
              <Link href="/dashboard/risk">
                <Button variant="ghost" size="sm" className="text-xs gap-1 font-mono text-muted-foreground">
                  <Eye className="w-3 h-3" /> Details
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <RiskMeter label="Daily Loss" value={Math.abs(risk.dailyPnlPct)} max={4} unit="%" />
            <RiskMeter label="Weekly Loss" value={Math.abs(risk.weeklyPnlPct)} max={6} unit="%" />
            <RiskMeter label="Max Drawdown" value={risk.currentDrawdownPct} max={8} unit="%" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="text-center p-2 rounded bg-muted/30">
                <div className="text-lg font-mono font-semibold text-foreground">{risk.tradesToday}</div>
                <div className="text-[10px] font-mono text-muted-foreground">TRADES TODAY</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/30">
                <div className="text-lg font-mono font-semibold text-foreground">{risk.openPositions}</div>
                <div className="text-[10px] font-mono text-muted-foreground">OPEN POS</div>
              </div>
            </div>
            <div className="pt-1">
              {risk.rules.filter(r => r.status !== "OK").map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs font-mono text-amber-500">
                  <AlertTriangle className="w-3 h-3" />
                  {r.name}: {r.currentValue.toFixed(2)}{r.unit} / {r.threshold}{r.unit}
                </div>
              ))}
              {risk.rules.filter(r => r.status !== "OK").length === 0 && (
                <div className="text-xs font-mono text-green-500 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> All risk rules passing
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Alerts + Recent Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Alerts */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Recent Alerts
              </CardTitle>
              <Link href="/dashboard/alerts">
                <Button variant="ghost" size="sm" className="text-xs gap-1 font-mono text-muted-foreground">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {alerts.length === 0 && (
                <div className="text-xs text-muted-foreground font-mono text-center py-4">No recent alerts</div>
              )}
              {alerts.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                    a.severity === "CRITICAL"
                      ? "border-red-500/30 bg-red-500/5"
                      : a.severity === "WARNING"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : a.severity === "SUCCESS"
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-border"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        a.severity === "CRITICAL"
                          ? "bg-red-500"
                          : a.severity === "WARNING"
                          ? "bg-amber-500"
                          : a.severity === "SUCCESS"
                          ? "bg-green-500"
                          : "bg-blue-500"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono font-semibold text-foreground truncate">{a.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{a.message}</div>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Recent Trades
              </CardTitle>
              <Link href="/dashboard/trades">
                <Button variant="ghost" size="sm" className="text-xs gap-1 font-mono text-muted-foreground">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {recentTrades.map((trade) => (
                <div key={trade.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono shrink-0 ${
                      trade.direction === "BUY" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"
                    }`}
                  >
                    {trade.direction}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-foreground">
                      #{trade.ticket} @ ${trade.entryPrice.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      Lot: {trade.lotSize} | {trade.session}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {trade.status === "OPEN" ? (
                      <Badge variant="outline" className="text-[10px] font-mono text-blue-400 border-blue-400/30">
                        OPEN
                      </Badge>
                    ) : (
                      <div
                        className={`text-xs font-mono font-semibold ${
                          (trade.pnlUsd ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {(trade.pnlUsd ?? 0) >= 0 ? "+" : ""}${trade.pnlUsd?.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heartbeat Strip */}
      <Card className="bg-card border-border">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Heart className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-mono text-muted-foreground shrink-0">HEARTBEAT</span>
            <div className="flex-1 flex items-center gap-1 overflow-hidden">
              {heartbeats.slice(0, 20).map((hb, i) => (
                <div
                  key={hb.id}
                  className={`h-4 w-1.5 rounded-full transition-all ${
                    hb.status === "ONLINE"
                      ? hb.latencyMs < 40
                        ? "bg-green-500"
                        : hb.latencyMs < 70
                        ? "bg-amber-500"
                        : "bg-orange-500"
                      : "bg-red-500"
                  }`}
                  style={{ opacity: 1 - i * 0.04 }}
                  title={`${hb.latencyMs}ms at ${new Date(hb.timestamp).toLocaleTimeString()}`}
                />
              ))}
            </div>
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              Uptime: {latestHb ? formatUptime(latestHb.uptime) : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Sub-components ──

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  color?: string
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={`w-3.5 h-3.5 ${color || "text-muted-foreground"}`} />
        </div>
        <div className={`text-lg font-mono font-semibold ${color || "text-foreground"}`}>{value}</div>
        {sub && <div className={`text-[10px] font-mono ${color || "text-muted-foreground"}`}>{sub}</div>}
      </CardContent>
    </Card>
  )
}

function RiskMeter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min((value / max) * 100, 100)
  const color =
    pct < 50 ? "bg-green-500" : pct < 75 ? "bg-amber-500" : "bg-red-500"

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono text-foreground">
          {value.toFixed(2)}{unit} / {max}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
