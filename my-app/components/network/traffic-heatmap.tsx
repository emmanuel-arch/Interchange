"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMemo } from "react"
import type { PacketHeader } from "@/lib/types"

interface TrafficHeatmapProps {
  packets: PacketHeader[]
}

const HOURS = 24
const MINUTES_PER_BLOCK = 15
const BLOCKS_PER_HOUR = 60 / MINUTES_PER_BLOCK

export function TrafficHeatmap({ packets }: TrafficHeatmapProps) {
  const heatmapData = useMemo(() => {
    const now = Date.now()
    const data: number[][] = Array.from({ length: HOURS }, () => Array(BLOCKS_PER_HOUR).fill(0))

    packets.forEach((packet) => {
      const age = now - packet.timestamp
      const hoursAgo = Math.floor(age / (1000 * 60 * 60))
      const minutesIntoHour = Math.floor((age % (1000 * 60 * 60)) / (1000 * 60))
      const block = Math.floor(minutesIntoHour / MINUTES_PER_BLOCK)

      if (hoursAgo < HOURS && block < BLOCKS_PER_HOUR) {
        const hourIndex = HOURS - 1 - hoursAgo
        data[hourIndex][block]++
      }
    })

    return data
  }, [packets])

  const maxValue = Math.max(...heatmapData.flat())

  const getHeatColor = (value: number) => {
    if (value === 0) return "bg-slate-900"
    const intensity = Math.min(value / (maxValue * 0.7), 1)
    if (intensity < 0.2) return "bg-blue-950"
    if (intensity < 0.4) return "bg-blue-900"
    if (intensity < 0.6) return "bg-blue-700"
    if (intensity < 0.8) return "bg-orange-600"
    return "bg-red-600"
  }

  return (
    <Card className="backdrop-blur-sm bg-card/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-base">Traffic Intensity (Last 24h)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex gap-1">
            <div className="w-12 text-xs text-slate-400"></div>
            {Array.from({ length: BLOCKS_PER_HOUR }, (_, i) => (
              <div key={i} className="flex-1 text-center text-xs text-slate-400">
                {i * MINUTES_PER_BLOCK === 0 ? ":00" : i * MINUTES_PER_BLOCK === 30 ? ":30" : ""}
              </div>
            ))}
          </div>
          {heatmapData.map((hourData, hourIndex) => (
            <div key={hourIndex} className="flex gap-1 items-center">
              <div className="w-12 text-xs text-slate-400 text-right">
                {new Date(Date.now() - (HOURS - 1 - hourIndex) * 60 * 60 * 1000).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  hour12: false,
                })}
              </div>
              {hourData.map((value, blockIndex) => (
                <div
                  key={blockIndex}
                  className={`flex-1 h-6 rounded-sm ${getHeatColor(value)} hover:ring-2 hover:ring-white/50 transition-all cursor-pointer`}
                  title={`${value} packets`}
                />
              ))}
            </div>
          ))}
          <div className="flex items-center justify-end gap-4 mt-4 text-xs text-slate-400">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-4 h-4 rounded bg-slate-900"></div>
              <div className="w-4 h-4 rounded bg-blue-950"></div>
              <div className="w-4 h-4 rounded bg-blue-900"></div>
              <div className="w-4 h-4 rounded bg-blue-700"></div>
              <div className="w-4 h-4 rounded bg-orange-600"></div>
              <div className="w-4 h-4 rounded bg-red-600"></div>
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
