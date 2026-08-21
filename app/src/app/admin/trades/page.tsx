"use client";

import TradeMonitor from "@/components/admin/TradeMonitor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { mockOpenTrades, mockClosedTrades } from "@/lib/mock-data";
import { formatUSD, formatPrice, formatLot, pnlColor } from "@/lib/utils";

export default function AdminTradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade Monitor</h1>
        <p className="text-muted-foreground text-sm">
          All open and recent closed trades
        </p>
      </div>

      <TradeMonitor trades={mockOpenTrades} />

      {/* Closed trades */}
      <Card className="border-slate-700/50 bg-slate-900/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gold-400" />
              Recent Closed Trades
            </CardTitle>
            <Badge variant="secondary">{mockClosedTrades.length} trades</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2 font-medium">Ticket</th>
                  <th className="text-left py-3 px-2 font-medium">Dir</th>
                  <th className="text-right py-3 px-2 font-medium">Entry</th>
                  <th className="text-right py-3 px-2 font-medium">Exit</th>
                  <th className="text-right py-3 px-2 font-medium">Lots</th>
                  <th className="text-right py-3 px-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {mockClosedTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-border/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-2 font-medium tabular-nums text-foreground">
                      #{trade.ticket}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={trade.direction === "BUY" ? "profit" : "loss"} className="gap-1">
                        {trade.direction === "BUY" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {trade.direction}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{formatPrice(trade.entryPrice)}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{trade.exitPrice ? formatPrice(trade.exitPrice) : "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{formatLot(trade.lotSize)}</td>
                    <td className={`py-3 px-2 text-right font-medium tabular-nums ${pnlColor(trade.pnl || 0)}`}>
                      {trade.pnl !== undefined ? formatUSD(trade.pnl) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
