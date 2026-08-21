"use client";

import TradingViewChart from "@/components/charts/TradingViewChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AdminChartPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Live Chart</h1>
        <p className="text-muted-foreground text-sm">
          XAUUSD price action — TradingView Lightweight Charts
        </p>
      </div>

      <Card className="border-slate-700/50 bg-slate-900/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gold-400" />
            XAUUSD — 4H Timeframe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TradingViewChart height={500} />
        </CardContent>
      </Card>
    </div>
  );
}
