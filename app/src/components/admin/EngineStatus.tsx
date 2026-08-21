"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Wifi, WifiOff, Clock, BarChart3, TrendingUp } from "lucide-react";
import { formatUSD, timeAgo } from "@/lib/utils";
import type { EngineStatus as EngineStatusType } from "@/types";

interface Props {
  status: EngineStatusType;
}

export default function EngineStatus({ status }: Props) {
  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-gold-400" />
            Engine Status
          </CardTitle>
          <Badge variant={status.isOnline ? "online" : "offline"}>
            {status.isOnline ? (
              <>
                <Wifi className="w-3 h-3 mr-1" />
                ONLINE
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1" />
                OFFLINE
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Heartbeat indicator */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
          <div className="relative">
            <span
              className={`block w-3 h-3 rounded-full ${
                status.isOnline ? "status-online" : "status-offline"
              }`}
            />
            {status.isOnline && (
              <span className="absolute inset-0 rounded-full animate-pulse-ring bg-emerald-500/30" />
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Heartbeat</p>
            <p className="text-sm font-medium text-foreground">
              {timeAgo(status.lastPing)}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <StatusRow
            icon={<Clock className="w-4 h-4" />}
            label="Session"
            value={status.currentSession || "No active session"}
          />
          <StatusRow
            icon={<TrendingUp className="w-4 h-4" />}
            label="Open Positions"
            value={String(status.openPositions)}
          />
          <StatusRow
            icon={<BarChart3 className="w-4 h-4" />}
            label="Daily P&L"
            value={formatUSD(status.dailyPnl)}
            valueColor={status.dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <StatusRow
            icon={<BarChart3 className="w-4 h-4" />}
            label="Weekly P&L"
            value={formatUSD(status.weeklyPnl)}
            valueColor={status.weeklyPnl >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>

        {/* Kill switch status */}
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            status.killSwitch
              ? "bg-red-500/10 border border-red-500/20"
              : "bg-emerald-500/10 border border-emerald-500/20"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              status.killSwitch ? "bg-red-500" : "bg-emerald-500"
            }`}
          />
          <span
            className={`text-xs font-medium ${
              status.killSwitch ? "text-red-400" : "text-emerald-400"
            }`}
          >
            Kill Switch: {status.killSwitch ? "ENGAGED" : "Disarmed"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span
        className={`text-sm font-medium tabular-nums ${
          valueColor || "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
