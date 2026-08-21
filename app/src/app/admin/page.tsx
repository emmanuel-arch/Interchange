"use client";

import EngineStatus from "@/components/admin/EngineStatus";
import KillSwitch from "@/components/admin/KillSwitch";
import TradeMonitor from "@/components/admin/TradeMonitor";
import RiskDashboard from "@/components/admin/RiskDashboard";
import { mockEngineStatus, mockOpenTrades, mockRiskMetrics } from "@/lib/mock-data";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <h1 className="font-heading text-3xl md:text-4xl">
            Admin Console
          </h1>
          <p className="text-lg text-muted-foreground">
            GoldStrike Engine Control Room
          </p>
        </div>
        <KillSwitch isKilled={mockEngineStatus.killSwitch} />
      </div>

      {/* Engine status + Risk side by side */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <EngineStatus status={mockEngineStatus} />
        </div>
        <div className="lg:col-span-2">
          <RiskDashboard metrics={mockRiskMetrics} />
        </div>
      </div>

      {/* Trade Monitor */}
      <TradeMonitor trades={mockOpenTrades} />
    </div>
  );
}
