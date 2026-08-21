"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts"
import { useMemo } from "react"
import type { PacketHeader } from "@/lib/types"
import { formatBytes } from "@/lib/format"

interface StatisticsChartProps {
  packets: PacketHeader[]
}

export function StatisticsChart({ packets }: StatisticsChartProps) {
  const bandwidthData = useMemo(() => {
    const data: { time: string; bytes: number }[] = []
    const now = Date.now()

    for (let i = 29; i >= 0; i--) {
      const timeWindow = now - i * 1000
      const windowPackets = packets.filter((p) => p.timestamp >= timeWindow && p.timestamp < timeWindow + 1000)
      const totalBytes = windowPackets.reduce((sum, p) => sum + p.size, 0)

      data.push({
        time: new Date(timeWindow).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
        bytes: totalBytes,
      })
    }

    return data
  }, [packets])

  const protocolData = useMemo(() => {
    const distribution: Record<string, number> = {}
    packets.forEach((p) => {
      distribution[p.protocol] = (distribution[p.protocol] || 0) + 1
    })

    return Object.entries(distribution).map(([protocol, count]) => ({
      protocol,
      count,
    }))
  }, [packets])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Bandwidth Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={bandwidthData}>
              <defs>
                <linearGradient id="bandwidthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                tickFormatter={(value) => value.split(":").slice(1).join(":")}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                tickFormatter={(value) => formatBytes(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.9)" }}
                formatter={(value: number) => [formatBytes(value), "Bytes"]}
              />
              <Area
                type="monotone"
                dataKey="bytes"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#bandwidthGradient)"
                animationDuration={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Protocol Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={protocolData}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={1} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="protocol" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.9)" }}
              />
              <Bar dataKey="count" fill="url(#barGradient)" radius={[4, 4, 0, 0]} animationDuration={300} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
