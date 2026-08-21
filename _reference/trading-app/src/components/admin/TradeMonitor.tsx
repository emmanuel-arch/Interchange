"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatUSD, formatPrice, formatLot, timeAgo, pnlColor } from "@/lib/utils";
import type { Trade } from "@/types";

interface Props {
  trades: Trade[];
}

export default function TradeMonitor({ trades }: Props) {
  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold-400" />
            Live Trades
          </CardTitle>
          <Badge variant="gold">{trades.length} Open</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No open trades
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2 font-medium">Ticket</th>
                  <th className="text-left py-3 px-2 font-medium">Direction</th>
                  <th className="text-right py-3 px-2 font-medium">Entry</th>
                  <th className="text-right py-3 px-2 font-medium">SL</th>
                  <th className="text-right py-3 px-2 font-medium">TP</th>
                  <th className="text-right py-3 px-2 font-medium">Lots</th>
                  <th className="text-right py-3 px-2 font-medium">P&L</th>
                  <th className="text-right py-3 px-2 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-border/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-2 font-medium tabular-nums text-foreground">
                      #{trade.ticket}
                    </td>
                    <td className="py-3 px-2">
                      <Badge
                        variant={
                          trade.direction === "BUY" ? "profit" : "loss"
                        }
                        className="gap-1"
                      >
                        {trade.direction === "BUY" ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {trade.direction}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-foreground">
                      {formatPrice(trade.entryPrice)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-red-400">
                      {trade.stopLoss ? formatPrice(trade.stopLoss) : "—"}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-emerald-400">
                      {trade.takeProfit ? formatPrice(trade.takeProfit) : "—"}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-foreground">
                      {formatLot(trade.lotSize)}
                    </td>
                    <td
                      className={`py-3 px-2 text-right font-medium tabular-nums ${pnlColor(
                        trade.pnl || 0
                      )}`}
                    >
                      {trade.pnl !== undefined
                        ? formatUSD(trade.pnl)
                        : "—"}
                    </td>
                    <td className="py-3 px-2 text-right text-muted-foreground">
                      {timeAgo(trade.openedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
