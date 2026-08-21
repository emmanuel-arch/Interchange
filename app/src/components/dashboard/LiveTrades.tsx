"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { mockOpenTrades, mockEngineStatus } from "@/lib/mock-data";
import { formatUSD, formatPrice, formatLot, pnlColor, timeAgo } from "@/lib/utils";

export default function LiveTrades() {
  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-gold-400" />
            Live Positions
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={mockEngineStatus.isOnline ? "online" : "offline"}>
              {mockEngineStatus.isOnline ? "Live" : "Offline"}
            </Badge>
            <Badge variant="secondary">{mockOpenTrades.length} open</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mockOpenTrades.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open positions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockOpenTrades.map((trade) => (
              <div
                key={trade.id}
                className="p-4 rounded-lg border border-border/50 bg-slate-800/30 hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={trade.direction === "BUY" ? "profit" : "loss"}
                      className="gap-1"
                    >
                      {trade.direction === "BUY" ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {trade.direction}
                    </Badge>
                    <span className="font-medium text-foreground text-sm">
                      {trade.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      #{trade.ticket}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ${pnlColor(
                      trade.pnl || 0
                    )}`}
                  >
                    {trade.pnl !== undefined ? formatUSD(trade.pnl) : "—"}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Entry</span>
                    <span className="text-foreground tabular-nums">
                      {formatPrice(trade.entryPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">SL</span>
                    <span className="text-red-400 tabular-nums">
                      {trade.stopLoss ? formatPrice(trade.stopLoss) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">TP</span>
                    <span className="text-emerald-400 tabular-nums">
                      {trade.takeProfit ? formatPrice(trade.takeProfit) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Lots</span>
                    <span className="text-foreground tabular-nums">
                      {formatLot(trade.lotSize)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Opened {timeAgo(trade.openedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
