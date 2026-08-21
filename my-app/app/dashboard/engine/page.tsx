"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Cpu, Power, PowerOff, Heart, Radio, Clock, Settings, Play, Pause,
  RefreshCw, Zap, Shield, AlertTriangle, ChevronDown, ChevronUp,
  Server, Terminal, RotateCcw, Activity
} from "lucide-react"
import {
  generateHeartbeat, generateLiveConditions, generateDashboardStats,
  generateRiskState, DEFAULT_ENGINE_CONFIG
} from "@/lib/trading-mock-data"
import type { Heartbeat, EngineConfig } from "@/lib/trading-types"

export default function EngineControlPage() {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([])
  const [killSwitch, setKillSwitch] = useState(false)
  const [engineRunning, setEngineRunning] = useState(true)
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const stats = useMemo(() => generateDashboardStats(), [])
  const conditions = useMemo(() => generateLiveConditions(), [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRunning) {
        setHeartbeats((prev) => [generateHeartbeat(), ...prev].slice(0, 60))
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [engineRunning])

  const latestHb = heartbeats[0]
  const avgLatency = heartbeats.length > 0
    ? Math.round(heartbeats.reduce((s, h) => s + h.latencyMs, 0) / heartbeats.length)
    : 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Cpu className="w-7 h-7 text-amber-500" />
            Engine Control
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Control, configure, and monitor the trading engine
          </p>
        </div>
      </div>

      {/* Control Panel — Cockpit Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button
          variant={engineRunning ? "outline" : "default"}
          className={`h-20 flex flex-col gap-2 font-mono ${engineRunning ? "border-green-500/30 text-green-500 hover:bg-green-500/10" : "bg-green-600 hover:bg-green-700"}`}
          onClick={() => setEngineRunning(!engineRunning)}
        >
          {engineRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          <span className="text-xs">{engineRunning ? "PAUSE ENGINE" : "START ENGINE"}</span>
        </Button>

        <Button
          variant={killSwitch ? "destructive" : "outline"}
          className={`h-20 flex flex-col gap-2 font-mono ${!killSwitch ? "border-red-500/30 text-red-500 hover:bg-red-500/10" : ""}`}
          onClick={() => setKillSwitch(!killSwitch)}
        >
          {killSwitch ? <PowerOff className="w-6 h-6" /> : <Power className="w-6 h-6" />}
          <span className="text-xs">{killSwitch ? "⚠ KILL ACTIVE" : "KILL SWITCH"}</span>
        </Button>

        <Button
          variant="outline"
          className="h-20 flex flex-col gap-2 font-mono border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
        >
          <RotateCcw className="w-6 h-6" />
          <span className="text-xs">RESTART ENGINE</span>
        </Button>

        <Button
          variant="outline"
          className="h-20 flex flex-col gap-2 font-mono border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
        >
          <RefreshCw className="w-6 h-6" />
          <span className="text-xs">SYNC CONFIG</span>
        </Button>
      </div>

      {/* Kill Switch Warning */}
      {killSwitch && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="py-4 flex items-center gap-4">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <div className="text-sm font-mono font-semibold text-red-500">🚨 KILL SWITCH ACTIVATED</div>
              <div className="text-xs font-mono text-red-400">
                Trading halted. No new trades. Open positions are still being managed.
              </div>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0 text-xs font-mono" onClick={() => setKillSwitch(false)}>
              Resume Trading
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Engine Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-500" />
              Engine Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="Status" value={engineRunning ? "RUNNING" : "STOPPED"} color={engineRunning ? "text-green-500" : "text-red-500"} />
            <StatusRow label="Kill Switch" value={killSwitch ? "ON" : "OFF"} color={killSwitch ? "text-red-500" : "text-green-500"} />
            <StatusRow label="Mode" value={config.tradingMode} color="text-amber-500" />
            <StatusRow label="Symbol" value={config.symbol} />
            <StatusRow label="Session" value={stats.currentSession} color="text-blue-400" />
            <StatusRow label="Heartbeat" value={latestHb ? `${latestHb.latencyMs}ms` : "—"} color={latestHb && latestHb.latencyMs < 50 ? "text-green-500" : "text-amber-500"} />
            <StatusRow label="Avg Latency" value={`${avgLatency}ms`} />
            <StatusRow label="Uptime" value={latestHb ? formatUptime(latestHb.uptime) : "—"} />
            <StatusRow label="Memory" value={latestHb ? `${latestHb.memoryUsageMb}MB` : "—"} />
            <StatusRow label="CPU" value={latestHb ? `${latestHb.cpuPercent}%` : "—"} />
          </CardContent>
        </Card>

        {/* Heartbeat Monitor */}
        <Card className="col-span-1 lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500 animate-pulse" />
              Heartbeat Monitor
              <span className="text-[10px] text-muted-foreground ml-2">every 5s • last 60 signals</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Heartbeat Visualization */}
            <div className="bg-black/40 rounded-lg p-4 mb-4">
              <div className="flex items-end gap-0.5 h-16 overflow-hidden">
                {heartbeats.slice(0, 60).map((hb, i) => (
                  <div
                    key={hb.id}
                    className="flex-1 min-w-[3px] rounded-t transition-all"
                    style={{
                      height: `${Math.min((hb.latencyMs / 100) * 100, 100)}%`,
                      backgroundColor:
                        hb.status !== "ONLINE"
                          ? "#ef4444"
                          : hb.latencyMs < 30
                          ? "#22c55e"
                          : hb.latencyMs < 60
                          ? "#eab308"
                          : "#f97316",
                      opacity: 1 - i * 0.015,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-mono text-muted-foreground">Latest</span>
                <span className="text-[9px] font-mono text-muted-foreground">5 min ago</span>
              </div>
            </div>

            {/* Heartbeat Log */}
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {heartbeats.slice(0, 12).map((hb) => (
                <div key={hb.id} className="flex items-center gap-3 text-xs font-mono p-1.5 rounded hover:bg-muted/30">
                  <div className={`w-1.5 h-1.5 rounded-full ${hb.status === "ONLINE" ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-muted-foreground">{new Date(hb.timestamp).toLocaleTimeString()}</span>
                  <span className="text-foreground">{hb.status}</span>
                  <span className={hb.latencyMs < 40 ? "text-green-400" : hb.latencyMs < 70 ? "text-amber-400" : "text-red-400"}>
                    {hb.latencyMs}ms
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    CPU: {hb.cpuPercent}% | MEM: {hb.memoryUsageMb}MB
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-500" />
              Engine Configuration
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-mono gap-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAdvanced ? "Basic" : "Advanced"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ConfigItem label="Risk Per Trade" value={`${config.riskPercent}%`} description="% of balance risked per trade" />
            <ConfigItem label="ATR SL Multiplier" value={`${config.atrSlMult}x`} description="Stop loss = ATR × multiplier" />
            <ConfigItem label="ATR TP1 Multiplier" value={`${config.atrTp1Mult}x`} description="First take profit level" />
            <ConfigItem label="ATR TP2 Multiplier" value={`${config.atrTp2Mult}x`} description="Final take profit level" />
            <ConfigItem label="Partial Close %" value={`${config.partialClosePct}%`} description="Close % at TP1" />
            <ConfigItem label="Breakeven Trigger" value={`${config.atrBreakevenTrigger}x ATR`} description="Move SL to BE at this profit" />

            {showAdvanced && (
              <>
                <ConfigItem label="Max Spread" value={`$${config.maxSpreadPrice}`} description="Reject if spread wider" />
                <ConfigItem label="Max Daily Loss" value={`${config.maxDailyLossPct}%`} description="Stop trading for the day" />
                <ConfigItem label="Max Weekly Loss" value={`${config.maxWeeklyLossPct}%`} description="Stop trading for the week" />
                <ConfigItem label="Max Drawdown" value={`${config.maxDrawdownPct}%`} description="FTMO safety limit" />
                <ConfigItem label="Max Trades/Day" value={`${config.maxTradesPerDay}`} description="Hard limit per day" />
                <ConfigItem label="Max Open Trades" value={`${config.maxOpenTrades}`} description="Concurrent position limit" />
                <ConfigItem label="ADX Minimum" value={`${config.adxMinimum}`} description="Minimum trend strength" />
                <ConfigItem label="RSI Range" value={`${config.rsiLow}-${config.rsiHigh}`} description="Neutral zone for entries" />
                <ConfigItem label="EMA20 Slope Bars" value={`${config.ema20SlopeBars}`} description="Bars to check slope" />
                <ConfigItem label="Max Extension" value={`${config.maxExtensionAtr}x ATR`} description="Reject if overextended" />
                <ConfigItem label="Trail Multiplier" value={`${config.atrTrailMult}x ATR`} description="Trailing stop distance" />
                <ConfigItem label="Magic Number" value={`${config.magicNumber}`} description="MT5 strategy identifier" />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Session Schedule */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Trading Sessions (EAT — UTC+3)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SessionCard
              name="LONDON"
              time="10:00 – 13:00"
              active={stats.currentSession === "LONDON"}
              emoji="🏛️"
            />
            <SessionCard
              name="NY OVERLAP"
              time="15:00 – 18:00"
              active={stats.currentSession === "NY_OVERLAP"}
              emoji="🗽"
            />
            <SessionCard
              name="NY CONTINUATION"
              time="18:00 – 20:00"
              active={stats.currentSession === "NY_CONT"}
              emoji="🌆"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-mono text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-semibold ${color || "text-foreground"}`}>{value}</span>
    </div>
  )
}

function ConfigItem({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">{label}</span>
        <span className="text-sm font-mono font-semibold text-amber-500">{value}</span>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/70">{description}</div>
    </div>
  )
}

function SessionCard({ name, time, active, emoji }: { name: string; time: string; active: boolean; emoji: string }) {
  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        active ? "border-amber-500/50 bg-amber-500/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-mono font-semibold text-foreground">{name}</span>
        {active && (
          <Badge className="ml-auto text-[9px] bg-amber-500/20 text-amber-500 border-amber-500/30">ACTIVE</Badge>
        )}
      </div>
      <div className="text-xs font-mono text-muted-foreground">{time} EAT</div>
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
