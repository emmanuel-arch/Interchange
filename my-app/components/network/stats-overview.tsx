"use client"

import { Card, CardContent } from "@/components/ui/card"
import { formatBytes, formatPacketsPerSecond } from "@/lib/format"
import type { TrafficStats } from "@/lib/types"
import { Activity, AlertTriangle, Network, Zap } from "lucide-react"

interface StatsOverviewProps {
  stats: TrafficStats
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const statItems = [
    {
      label: "Total Packets",
      value: stats.totalPackets.toLocaleString(),
      icon: Zap,
      color: "text-blue-400",
    },
    {
      label: "Total Bytes",
      value: formatBytes(stats.totalBytes),
      icon: Activity,
      color: "text-green-400",
    },
    {
      label: "Packets/sec",
      value: formatPacketsPerSecond(stats.packetsPerSecond),
      icon: Network,
      color: "text-purple-400",
    },
    {
      label: "Suspicious",
      value: stats.suspiciousCount.toString(),
      icon: AlertTriangle,
      color: "text-red-400",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {statItems.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label} className="backdrop-blur-sm bg-card/50 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-bold font-mono mt-1">{item.value}</p>
                </div>
                <Icon className={`w-8 h-8 ${item.color}`} strokeWidth={1} />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
