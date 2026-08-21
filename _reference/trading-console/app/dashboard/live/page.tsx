"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Radio, Play, Pause, Trash2, Download, Eye, EyeOff, Maximize2, Minimize2,
  Terminal, Activity, TrendingUp, TrendingDown
} from "lucide-react"
import {
  generateLiveConditions, generateTerminalOutput,
} from "@/lib/trading-mock-data"
import type { LiveConditions, TerminalLine } from "@/lib/trading-mock-data"

const MAX_LINES = 500

export default function LiveTradePage() {
  const [isPaused, setIsPaused] = useState(false)
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [conditions, setConditions] = useState<LiveConditions>(generateLiveConditions())
  const [expanded, setExpanded] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrollRef = useRef(false)

  // Generate condition updates every second
  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(() => {
      const newConds = generateLiveConditions()
      setConditions(newConds)
      const termLines = generateTerminalOutput(newConds)
      setLines((prev) => [...termLines, ...prev].slice(0, MAX_LINES))
    }, 1000)
    return () => clearInterval(interval)
  }, [isPaused])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current && !userScrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [lines.length, autoScroll])

  const handleScroll = () => {
    if (scrollRef.current) {
      userScrollRef.current = scrollRef.current.scrollTop > 50
    }
  }

  const handleClear = () => setLines([])
  const handleExport = () => {
    const text = lines.map((l) => l.text).join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `goldstrike-live-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Radio className="w-7 h-7 text-green-500 animate-pulse" />
            Live Trade Monitor
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Real-time engine condition stream — XAUUSDc
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsPaused(!isPaused)} className="gap-2 bg-transparent font-mono text-xs">
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-2 bg-transparent font-mono text-xs">
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 bg-transparent font-mono text-xs">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} className="gap-2 bg-transparent font-mono text-xs">
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Live Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MiniStat label="BID" value={`$${conditions.bid.toFixed(3)}`} />
        <MiniStat label="SPREAD" value={`$${conditions.spread.toFixed(3)}`} color={conditions.spread <= 0.4 ? "text-green-500" : "text-red-500"} />
        <MiniStat label="SESSION" value={conditions.session} color="text-amber-500" />
        <MiniStat label="CONDITIONS" value={`${conditions.conditionsMet}/${conditions.conditionsTotal}`} color={conditions.conditionsMet >= 7 ? "text-green-500" : "text-amber-500"} />
        <MiniStat label="SIGNAL" value={conditions.signal === 1 ? "BUY" : conditions.signal === -1 ? "SELL" : "NONE"} color={conditions.signal === 1 ? "text-green-500" : conditions.signal === -1 ? "text-red-500" : "text-muted-foreground"} />
        <MiniStat label="ADX" value={conditions.m15.adx.toFixed(1)} color={conditions.m15.adx >= 22 ? "text-green-500" : "text-red-500"} />
      </div>

      {/* Conditions Quick View */}
      <Card className="bg-card border-border">
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-2">
            {conditions.conditions.map((c, i) => (
              <Badge
                key={i}
                variant="outline"
                className={`text-[10px] font-mono ${
                  c.status === "PASS"
                    ? "text-green-400 border-green-400/30 bg-green-400/5"
                    : c.status === "FAIL"
                    ? "text-red-400 border-red-400/30 bg-red-400/5"
                    : "text-amber-400 border-amber-400/30 bg-amber-400/5"
                }`}
              >
                {c.status === "PASS" ? "✓" : c.status === "FAIL" ? "✗" : "◌"} {c.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Terminal Output */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-500" />
              Engine Terminal
              <span className="text-[10px] text-muted-foreground">
                {lines.length} lines • {isPaused ? "PAUSED" : "STREAMING"}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className="text-xs font-mono gap-1"
              >
                {autoScroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                Auto-scroll {autoScroll ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="bg-black rounded-lg p-4 font-mono text-xs overflow-y-auto transition-all"
            style={{ maxHeight: expanded ? "600px" : "300px" }}
          >
            {lines.map((line) => (
              <div key={line.id} className={getLineClass(line.type)}>
                {line.text}
              </div>
            ))}
            {lines.length === 0 && (
              <div className="text-muted-foreground text-center py-8">
                {isPaused ? "Stream paused. Press Resume to continue." : "Waiting for engine data..."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Indicator Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <IndicatorCard
          title="M15 Trend Filter"
          items={[
            { label: "Price", value: conditions.m15.price.toFixed(3) },
            { label: "EMA50", value: conditions.m15.ema50.toFixed(3) },
            { label: "EMA200", value: conditions.m15.ema200.toFixed(3) },
            { label: "ADX", value: conditions.m15.adx.toFixed(1), color: conditions.m15.adx >= 22 ? "text-green-500" : "text-red-500" },
            { label: "Trend", value: conditions.m15.trendDirection, color: conditions.m15.trendDirection === "BULLISH" ? "text-green-500" : conditions.m15.trendDirection === "BEARISH" ? "text-red-500" : "text-amber-500" },
          ]}
          icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        />
        <IndicatorCard
          title="M5 Entry Zone"
          items={[
            { label: "Price", value: conditions.m5.price.toFixed(3) },
            { label: "EMA20", value: conditions.m5.ema20.toFixed(3) },
            { label: "ATR", value: conditions.m5.atr.toFixed(3) },
            { label: "RSI", value: conditions.m5.rsi.toFixed(1), color: conditions.m5.rsi >= 40 && conditions.m5.rsi <= 60 ? "text-green-500" : "text-red-500" },
            { label: "Slope", value: `${conditions.m5.ema20Slope > 0 ? "↑" : "↓"} ${Math.abs(conditions.m5.ema20Slope).toFixed(3)}` },
          ]}
          icon={<Activity className="w-4 h-4 text-amber-400" />}
        />
        <IndicatorCard
          title="M1 Candle Trigger"
          items={[
            { label: "Engulfing", value: conditions.m1.engulfing ? "YES" : "NO", color: conditions.m1.engulfing ? "text-green-500" : "text-muted-foreground" },
            { label: "Momentum", value: conditions.m1.momentum ? "YES" : "NO", color: conditions.m1.momentum ? "text-green-500" : "text-muted-foreground" },
            { label: "Pattern", value: conditions.m1.pattern, color: conditions.m1.pattern !== "NONE" ? "text-amber-500" : "text-muted-foreground" },
            { label: "Spread", value: `$${conditions.spread.toFixed(3)}`, color: conditions.spread <= 0.4 ? "text-green-500" : "text-red-500" },
            { label: "Signal", value: conditions.signal === 1 ? "BUY ↑" : conditions.signal === -1 ? "SELL ↓" : "WAIT", color: conditions.signal !== 0 ? "text-amber-500" : "text-muted-foreground" },
          ]}
          icon={<TrendingDown className="w-4 h-4 text-red-400" />}
        />
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-2.5 text-center">
        <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-mono font-semibold ${color || "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function IndicatorCard({
  title,
  items,
  icon,
}: {
  title: string
  items: { label: string; value: string; color?: string }[]
  icon: React.ReactNode
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">{item.label}</span>
            <span className={`text-xs font-mono font-semibold ${item.color || "text-foreground"}`}>{item.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function getLineClass(type: TerminalLine["type"]): string {
  const base = "leading-5 whitespace-pre"
  switch (type) {
    case "header":
      return `${base} text-amber-400 font-semibold`
    case "section":
      return `${base} text-blue-400 font-semibold`
    case "pass":
      return `${base} text-green-400`
    case "fail":
      return `${base} text-red-400`
    case "wait":
      return `${base} text-amber-400`
    case "info":
      return `${base} text-slate-300`
    case "summary":
      return `${base} text-foreground font-semibold`
    case "divider":
      return `${base} text-muted-foreground/50`
    default:
      return `${base} text-foreground`
  }
}
