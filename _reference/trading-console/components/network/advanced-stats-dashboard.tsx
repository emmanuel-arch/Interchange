"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { formatBytes } from "@/lib/format"
import type { PacketHeader, TrafficStats } from "@/lib/types"
import { useMemo } from "react"
import { TrendingUp, TrendingDown, Minus, Shield, Globe, Cpu, HardDrive } from "lucide-react"

interface AdvancedStatsDashboardProps {
  packets: PacketHeader[]
  stats: TrafficStats
}

export function AdvancedStatsDashboard({ packets, stats }: AdvancedStatsDashboardProps) {
  const advancedMetrics = useMemo(() => {
    const uniqueSourceIps = new Set(packets.map((p) => p.sourceIp)).size
    const uniqueDestIps = new Set(packets.map((p) => p.destIp)).size
    const uniquePorts = new Set(packets.map((p) => p.destPort)).size

    const topSources = Object.entries(
      packets.reduce(
        (acc, p) => {
          acc[p.sourceIp] = (acc[p.sourceIp] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    const topPorts = Object.entries(
      packets.reduce(
        (acc, p) => {
          acc[p.destPort] = (acc[p.destPort] || 0) + 1
          return acc
        },
        {} as Record<number, number>,
      ),
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    const avgPacketSize = packets.length > 0 ? stats.totalBytes / packets.length : 0

    const protocolHealth = {
      TCP: packets.filter((p) => p.protocol === "TCP").length,
      UDP: packets.filter((p) => p.protocol === "UDP").length,
      HTTP: packets.filter((p) => p.protocol === "HTTP" || p.protocol === "HTTPS").length,
      DNS: packets.filter((p) => p.protocol === "DNS").length,
    }

    const healthScore = Math.max(0, 100 - stats.suspiciousCount * 2 - (uniqueSourceIps > 50 ? 10 : 0))

    return {
      uniqueSourceIps,
      uniqueDestIps,
      uniquePorts,
      topSources,
      topPorts,
      avgPacketSize,
      protocolHealth,
      healthScore,
    }
  }, [packets, stats])

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-400"
    if (score >= 60) return "text-yellow-400"
    if (score >= 40) return "text-orange-400"
    return "text-red-400"
  }

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent"
    if (score >= 60) return "Good"
    if (score >= 40) return "Fair"
    return "Poor"
  }

  const getTrend = (value: number, threshold: number) => {
    if (value > threshold) return <TrendingUp className="w-4 h-4 text-green-400" />
    if (value < threshold * 0.8) return <TrendingDown className="w-4 h-4 text-red-400" />
    return <Minus className="w-4 h-4 text-muted-foreground" />
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Network Health Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-4xl font-bold ${getHealthColor(advancedMetrics.healthScore)}`}>
                {advancedMetrics.healthScore}
              </div>
              <div className="text-sm text-muted-foreground">{getHealthLabel(advancedMetrics.healthScore)}</div>
            </div>
            <Shield className={`w-12 h-12 ${getHealthColor(advancedMetrics.healthScore)}`} />
          </div>
          <Progress value={advancedMetrics.healthScore} className="h-2" />
          <div className="text-xs text-muted-foreground">
            Based on {stats.suspiciousCount} suspicious packets and {advancedMetrics.uniqueSourceIps} unique sources
          </div>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Top Traffic Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {advancedMetrics.topSources.map(([ip, count], idx) => (
              <div key={ip} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                    {idx + 1}
                  </Badge>
                  <span className="text-sm font-mono text-cyan-400">{ip}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{count} packets</span>
                  {getTrend(count, packets.length / 10)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            Top Destination Ports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {advancedMetrics.topPorts.map(([port, count], idx) => (
              <div key={port} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                    {idx + 1}
                  </Badge>
                  <span className="text-sm font-mono">{port}</span>
                  <span className="text-xs text-muted-foreground">
                    {port === "80" || port === "8080"
                      ? "(HTTP)"
                      : port === "443"
                        ? "(HTTPS)"
                        : port === "53"
                          ? "(DNS)"
                          : port === "22"
                            ? "(SSH)"
                            : ""}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{count} packets</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Traffic Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Unique Sources</span>
              <span className="text-sm font-mono font-semibold">{advancedMetrics.uniqueSourceIps}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Unique Destinations</span>
              <span className="text-sm font-mono font-semibold">{advancedMetrics.uniqueDestIps}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Unique Ports</span>
              <span className="text-sm font-mono font-semibold">{advancedMetrics.uniquePorts}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Packet Size</span>
              <span className="text-sm font-mono font-semibold">{formatBytes(advancedMetrics.avgPacketSize)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Active Connections</span>
              <span className="text-sm font-mono font-semibold">{stats.activeConnections}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-sm bg-card/50 border-white/10 md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Protocol Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(advancedMetrics.protocolHealth).map(([protocol, count]) => {
              const percentage = packets.length > 0 ? (count / packets.length) * 100 : 0
              return (
                <div key={protocol} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{protocol}</span>
                    <span className="font-mono">
                      {count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
