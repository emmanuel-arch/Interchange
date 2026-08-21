"use client"

import { useMemo } from "react"
import type { PacketHeader } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { WorldMap } from "@/components/ui/world-map"

interface TrafficMapProps {
  packets: PacketHeader[]
}

interface LocationPoint {
  lat: number
  lng: number
  count: number
  country: string
  city: string
  protocol: string
}

interface LocationData {
  lat: number
  lng: number
  country: string
  city: string
  totalCount: number
  protocols: Record<string, number>
}

export function TrafficMap({ packets }: TrafficMapProps) {
  const validPackets = useMemo(() => {
    return packets.filter((p) => p.geolocation && p.geolocation.lat !== undefined && p.geolocation.lng !== undefined)
  }, [packets])

  const locationData = useMemo(() => {
    const locationMap = new Map<string, LocationData>()

    validPackets.forEach((packet) => {
      const key = `${packet.geolocation.lat},${packet.geolocation.lng}`
      const existing = locationMap.get(key)

      if (existing) {
        existing.totalCount++
        existing.protocols[packet.protocol] = (existing.protocols[packet.protocol] || 0) + 1
      } else {
        locationMap.set(key, {
          lat: packet.geolocation.lat,
          lng: packet.geolocation.lng,
          country: packet.geolocation.country,
          city: packet.geolocation.city,
          totalCount: 1,
          protocols: { [packet.protocol]: 1 },
        })
      }
    })

    return Array.from(locationMap.values())
  }, [validPackets])

  // Aggregate packets by location and protocol
  const locationPoints = useMemo(() => {
    const locationMap = new Map<string, LocationPoint>()

    validPackets.forEach((packet) => {
      const key = `${packet.geolocation.lat},${packet.geolocation.lng},${packet.protocol}`
      const existing = locationMap.get(key)

      if (existing) {
        existing.count++
      } else {
        locationMap.set(key, {
          lat: packet.geolocation.lat,
          lng: packet.geolocation.lng,
          count: 1,
          country: packet.geolocation.country,
          city: packet.geolocation.city,
          protocol: packet.protocol,
        })
      }
    })

    return Array.from(locationMap.values())
  }, [validPackets])

  const getProtocolColor = (protocol: string) => {
    const colors: Record<string, string> = {
      TCP: "#3b82f6", // blue
      UDP: "#a855f7", // purple
      HTTP: "#22c55e", // green
      HTTPS: "#22c55e", // green
      DNS: "#fb923c", // orange
      SSH: "#ec4899", // pink
      FTP: "#eab308", // yellow
    }
    return colors[protocol] || "#94a3b8" // gray fallback
  }

  const mapDots = useMemo(() => {
    return [] // Keep empty to prevent connecting lines
  }, [])

  return (
    <Card className="p-6 bg-background">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white">Traffic Origins Map</h3>
            <p className="text-sm text-slate-400 font-mono">Hover for more info</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-2xl font-bold text-white">{validPackets.length.toLocaleString()}</p>
            <p className="text-sm text-slate-400">
              {locationData.length} location{locationData.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <WorldMap
          dots={mapDots}
          showLabels={false}
          locationPoints={locationPoints}
          locationData={locationData}
          getProtocolColor={getProtocolColor}
        />

        {/* Legend */}
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg p-4 border border-slate-800">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm text-slate-300">TCP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span className="text-sm text-slate-300">UDP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-slate-300">HTTP/S</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className="text-sm text-slate-300">DNS</span>
            </div>
          </div>
        </div>

        {/* Top locations by protocol */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {locationPoints
            .sort((a, b) => b.count - a.count)
            .slice(0, 4)
            .map((point, idx) => (
              <div
                key={idx}
                className="bg-slate-900 rounded-lg p-3 border border-slate-800 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getProtocolColor(point.protocol) }}
                  ></div>
                  <div className="text-sm font-medium text-white">{point.protocol}</div>
                </div>
                <div className="text-xs text-slate-400">{point.country}</div>
                <div className="text-xs text-slate-500">{point.count} packets</div>
              </div>
            ))}
        </div>
      </div>
    </Card>
  )
}
