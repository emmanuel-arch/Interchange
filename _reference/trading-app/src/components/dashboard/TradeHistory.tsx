"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { mockClosedTrades } from "@/lib/mock-data";
import { formatUSD, formatPrice, formatLot, pnlColor, timeAgo } from "@/lib/utils";
import type { Trade } from "@/types";

const PAGE_SIZE = 5;

export default function TradeHistory() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  const filtered =
    filter === "ALL"
      ? mockClosedTrades
      : mockClosedTrades.filter((t) => t.direction === filter);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalPnl = mockClosedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winCount = mockClosedTrades.filter((t) => (t.pnl || 0) > 0).length;
  const winRate =
    mockClosedTrades.length > 0
      ? ((winCount / mockClosedTrades.length) * 100).toFixed(1)
      : "0";

  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-gold-400" />
            Trade History
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Summary badges */}
            <Badge variant="secondary" className="tabular-nums">
              {mockClosedTrades.length} trades
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              {winRate}% WR
            </Badge>
            <Badge
              variant={totalPnl >= 0 ? "profit" : "loss"}
              className="tabular-nums"
            >
              {formatUSD(totalPnl)}
            </Badge>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mt-2">
          {(["ALL", "BUY", "SELL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === f
                  ? "bg-gold-500/20 text-gold-400 border border-gold-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-slate-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-3 px-2 font-medium">Ticket</th>
                <th className="text-left py-3 px-2 font-medium">Direction</th>
                <th className="text-right py-3 px-2 font-medium">Entry</th>
                <th className="text-right py-3 px-2 font-medium">Exit</th>
                <th className="text-right py-3 px-2 font-medium">Lots</th>
                <th className="text-right py-3 px-2 font-medium">P&L</th>
                <th className="text-right py-3 px-2 font-medium">Closed</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((trade: Trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-border/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3 px-2 font-medium tabular-nums text-foreground">
                    #{trade.ticket}
                  </td>
                  <td className="py-3 px-2">
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
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {formatPrice(trade.entryPrice)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {trade.exitPrice ? formatPrice(trade.exitPrice) : "—"}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {formatLot(trade.lotSize)}
                  </td>
                  <td
                    className={`py-3 px-2 text-right font-medium tabular-nums ${pnlColor(
                      trade.pnl || 0
                    )}`}
                  >
                    {trade.pnl !== undefined ? formatUSD(trade.pnl) : "—"}
                  </td>
                  <td className="py-3 px-2 text-right text-xs text-muted-foreground">
                    {trade.closedAt ? timeAgo(trade.closedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
