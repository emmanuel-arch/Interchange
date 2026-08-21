"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Database, Play, Table, Search, Download } from "lucide-react"

const PRESET_QUERIES = [
  { label: "All Open Trades", query: "SELECT * FROM trades WHERE status = 'OPEN' ORDER BY timestamp DESC;" },
  { label: "Today's Trades", query: "SELECT * FROM trades WHERE DATE(timestamp) = CURRENT_DATE ORDER BY timestamp DESC;" },
  { label: "Weekly Summary", query: "SELECT date, trades_count, wins, losses, gross_pnl, ending_balance FROM daily_summary ORDER BY date DESC LIMIT 7;" },
  { label: "System State", query: "SELECT * FROM system_state;" },
  { label: "Trade Events", query: "SELECT te.*, t.direction, t.entry_price FROM trade_events te JOIN trades t ON te.ticket = t.ticket ORDER BY te.timestamp DESC LIMIT 20;" },
  { label: "Win Rate", query: "SELECT COUNT(*) as total, SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins, ROUND(AVG(CASE WHEN pnl_usd > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as win_rate FROM trades WHERE status = 'CLOSED';" },
]

interface QueryResult {
  columns: string[]
  rows: Record<string, string>[]
  rowCount: number
  executionMs: number
}

// Mock query results
function executeMockQuery(query: string): QueryResult {
  const q = query.toLowerCase()
  if (q.includes("system_state")) {
    return {
      columns: ["key", "value", "updated_at"],
      rows: [
        { key: "kill_switch", value: "OFF", updated_at: new Date().toISOString() },
        { key: "engine_status", value: "ONLINE", updated_at: new Date().toISOString() },
      ],
      rowCount: 2,
      executionMs: 12,
    }
  }
  if (q.includes("open")) {
    return {
      columns: ["ticket", "direction", "entry_price", "stop_loss", "take_profit", "lot_size", "session", "timestamp"],
      rows: [
        { ticket: "273984201", direction: "BUY", entry_price: "4820.750", stop_loss: "4812.450", take_profit: "4829.050", lot_size: "0.05", session: "LONDON", timestamp: new Date().toISOString() },
      ],
      rowCount: 1,
      executionMs: 18,
    }
  }
  if (q.includes("daily_summary")) {
    return {
      columns: ["date", "trades_count", "wins", "losses", "gross_pnl", "ending_balance"],
      rows: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i)
        return {
          date: d.toISOString().slice(0, 10),
          trades_count: String(Math.floor(Math.random() * 5) + 1),
          wins: String(Math.floor(Math.random() * 4)),
          losses: String(Math.floor(Math.random() * 3)),
          gross_pnl: (Math.random() * 200 - 50).toFixed(2),
          ending_balance: (5000 + Math.random() * 500).toFixed(2),
        }
      }),
      rowCount: 7,
      executionMs: 24,
    }
  }
  if (q.includes("win_rate")) {
    return {
      columns: ["total", "wins", "win_rate"],
      rows: [{ total: "42", wins: "27", win_rate: "64.3" }],
      rowCount: 1,
      executionMs: 8,
    }
  }
  return {
    columns: ["ticket", "direction", "entry_price", "pnl_usd", "status", "session", "timestamp"],
    rows: Array.from({ length: 5 }, (_, i) => ({
      ticket: String(273984100 + i),
      direction: Math.random() > 0.5 ? "BUY" : "SELL",
      entry_price: (4750 + Math.random() * 100).toFixed(3),
      pnl_usd: (Math.random() * 100 - 30).toFixed(2),
      status: i === 0 ? "OPEN" : "CLOSED",
      session: ["LONDON", "NY_OVERLAP", "NY_CONT"][i % 3],
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    })),
    rowCount: 5,
    executionMs: 15,
  }
}

export default function DatabasePage() {
  const [query, setQuery] = useState(PRESET_QUERIES[0].query)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const execute = () => {
    setError(null)
    try {
      setResult(executeMockQuery(query))
    } catch {
      setError("Query execution failed")
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <Database className="w-7 h-7 text-amber-500" />
          Database Explorer
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          PostgreSQL @ 45.150.190.19 — quantempire
        </p>
      </div>

      {/* Preset Queries */}
      <div className="flex flex-wrap gap-2">
        {PRESET_QUERIES.map((p) => (
          <Button key={p.label} variant="outline" size="sm" className="text-xs font-mono" onClick={() => { setQuery(p.query); setResult(null) }}>
            {p.label}
          </Button>
        ))}
      </div>

      {/* Query Editor */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-24 bg-black/40 rounded-lg p-3 text-xs font-mono text-green-400 border-none resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            spellCheck={false}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-[10px] font-mono text-muted-foreground">
              {result && `${result.rowCount} rows • ${result.executionMs}ms`}
            </div>
            <Button size="sm" className="gap-2 font-mono text-xs" onClick={execute}>
              <Play className="w-3.5 h-3.5" /> Execute
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-3 text-xs font-mono text-red-500">{error}</CardContent>
        </Card>
      )}

      {result && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Table className="w-4 h-4 text-amber-500" />
                Results ({result.rowCount} rows)
              </CardTitle>
              <Badge variant="outline" className="text-[9px] font-mono text-green-400 border-green-400/30">
                {result.executionMs}ms
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    {result.columns.map((col) => (
                      <th key={col} className="text-left py-2 px-3 text-muted-foreground font-normal">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      {result.columns.map((col) => (
                        <td key={col} className="py-2 px-3 text-foreground">{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
