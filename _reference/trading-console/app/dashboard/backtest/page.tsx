"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FlaskConical, Play, BarChart3, TrendingUp, Target, AlertTriangle } from "lucide-react"
import { generateBacktestResult } from "@/lib/trading-mock-data"
import type { BacktestResult } from "@/lib/trading-types"

export default function BacktestPage() {
  const [results, setResults] = useState<BacktestResult[]>(() =>
    Array.from({ length: 5 }, () => generateBacktestResult())
  )
  const [isRunning, setIsRunning] = useState(false)

  const runBacktest = () => {
    setIsRunning(true)
    setTimeout(() => {
      setResults((prev) => [{ ...generateBacktestResult(), status: "COMPLETED" }, ...prev])
      setIsRunning(false)
    }, 3000)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <FlaskConical className="w-7 h-7 text-amber-500" />
            Backtesting Lab
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Run strategy backtests on historical XAU/USD data
          </p>
        </div>
        <Button className="gap-2 font-mono text-xs" onClick={runBacktest} disabled={isRunning}>
          <Play className="w-4 h-4" />
          {isRunning ? "Running..." : "Run Backtest"}
        </Button>
      </div>

      {isRunning && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-mono text-amber-500">Running backtest on 30-day XAUUSD 5m data...</span>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-4">
        {results.map((r) => (
          <Card key={r.id} className="bg-card border-border">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[9px] font-mono text-green-400 border-green-400/30">
                    {r.status}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {new Date(r.timestamp).toLocaleString()} • {r.period}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <ResultStat label="Trades" value={r.totalTrades.toString()} />
                <ResultStat label="Wins" value={r.wins.toString()} color="text-green-500" />
                <ResultStat label="Losses" value={r.losses.toString()} color="text-red-500" />
                <ResultStat label="Win Rate" value={`${r.winRate.toFixed(1)}%`} color={r.winRate > 55 ? "text-green-500" : "text-amber-500"} />
                <ResultStat label="Profit Factor" value={r.profitFactor.toFixed(2)} color={r.profitFactor > 1.5 ? "text-green-500" : "text-amber-500"} />
                <ResultStat label="Net P&L" value={`$${r.netPnl.toFixed(0)}`} color={r.netPnl > 0 ? "text-green-500" : "text-red-500"} />
                <ResultStat label="Max DD" value={`${r.maxDrawdown.toFixed(1)}%`} color={r.maxDrawdown < 5 ? "text-green-500" : "text-red-500"} />
                <ResultStat label="Sharpe" value={r.sharpeRatio.toFixed(2)} color={r.sharpeRatio > 1.5 ? "text-green-500" : "text-amber-500"} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function ResultStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-mono font-semibold ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground uppercase">{label}</div>
    </div>
  )
}
