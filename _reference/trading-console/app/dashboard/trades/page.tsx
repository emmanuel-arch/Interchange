"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { History, Search, Download, Filter, ArrowUpDown } from "lucide-react"
import { generateTradeHistory } from "@/lib/trading-mock-data"
import type { Trade } from "@/lib/trading-types"

export default function TradesPage() {
  const allTrades = useMemo(() => generateTradeHistory(50), [])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL")
  const [dirFilter, setDirFilter] = useState<"ALL" | "BUY" | "SELL">("ALL")

  const filtered = allTrades.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false
    if (dirFilter !== "ALL" && t.direction !== dirFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.ticket.toString().includes(q) || t.session.toLowerCase().includes(q)
    }
    return true
  })

  const openTrades = allTrades.filter((t) => t.status === "OPEN")
  const closedTrades = allTrades.filter((t) => t.status === "CLOSED")
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0)
  const wins = closedTrades.filter((t) => (t.pnlUsd ?? 0) > 0).length
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0

  const handleExport = () => {
    const csv = [
      "Ticket,Direction,Entry,Exit,SL,TP,Lot,PnL,Status,Session,Time",
      ...filtered.map((t) =>
        `${t.ticket},${t.direction},${t.entryPrice},${t.exitPrice ?? ""},${t.stopLoss},${t.takeProfit},${t.lotSize},${t.pnlUsd ?? ""},${t.status},${t.session},${new Date(t.timestamp).toISOString()}`
      ),
    ].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `goldstrike-trades-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <History className="w-7 h-7 text-amber-500" />
            Trade History
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {allTrades.length} trades • {openTrades.length} open • Win Rate: {winRate.toFixed(1)}%
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-xs font-mono gap-2" onClick={handleExport}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-mono font-bold text-foreground">{allTrades.length}</div>
            <div className="text-[9px] font-mono text-muted-foreground">TOTAL TRADES</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-mono font-bold text-blue-400">{openTrades.length}</div>
            <div className="text-[9px] font-mono text-muted-foreground">OPEN</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-mono font-bold text-green-500">{wins}</div>
            <div className="text-[9px] font-mono text-muted-foreground">WINS</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-mono font-bold text-red-500">{closedTrades.length - wins}</div>
            <div className="text-[9px] font-mono text-muted-foreground">LOSSES</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className={`text-lg font-mono font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
            <div className="text-[9px] font-mono text-muted-foreground">NET P&L</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket, session..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs font-mono h-8"
          />
        </div>
        {(["ALL", "OPEN", "CLOSED"] as const).map((f) => (
          <Button key={f} variant={statusFilter === f ? "default" : "outline"} size="sm" className="text-xs font-mono" onClick={() => setStatusFilter(f)}>
            {f}
          </Button>
        ))}
        {(["ALL", "BUY", "SELL"] as const).map((f) => (
          <Button key={f} variant={dirFilter === f ? "default" : "outline"} size="sm" className={`text-xs font-mono ${f === "BUY" ? "text-green-400" : f === "SELL" ? "text-red-400" : ""}`} onClick={() => setDirFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      {/* Trade Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-normal">Ticket</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Dir</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Entry</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">SL</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">TP</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Lot</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Exit</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">P&L</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Status</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Session</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 text-foreground">#{t.ticket}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${t.direction === "BUY" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}>
                        {t.direction}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-foreground">${t.entryPrice.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-red-400">${t.stopLoss.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-green-400">${t.takeProfit.toFixed(2)}</td>
                    <td className="py-2 px-3 text-center text-foreground">{t.lotSize}</td>
                    <td className="py-2 px-3 text-right text-foreground">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${(t.pnlUsd ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {t.pnlUsd !== null ? `${t.pnlUsd >= 0 ? "+" : ""}$${t.pnlUsd.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${t.status === "OPEN" ? "text-blue-400 border-blue-400/30" : "text-muted-foreground"}`}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{t.session}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {new Date(t.timestamp).toLocaleString()}
                    </td>
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
