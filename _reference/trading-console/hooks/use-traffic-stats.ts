"use client"

import { useMemo } from "react"
import type { PacketHeader, TrafficStats, Protocol } from "@/lib/types"

export function useTrafficStats(packets: PacketHeader[], windowSeconds = 5): TrafficStats {
  return useMemo(() => {
    const now = Date.now()
    const recentPackets = packets.filter((p) => now - p.timestamp < windowSeconds * 1000)

    const totalBytes = packets.reduce((sum, p) => sum + p.size, 0)
    const protocolDistribution: Record<Protocol, number> = {} as Record<Protocol, number>

    packets.forEach((p) => {
      protocolDistribution[p.protocol] = (protocolDistribution[p.protocol] || 0) + 1
    })

    const suspiciousCount = packets.filter((p) => p.isSuspicious).length

    return {
      totalPackets: packets.length,
      totalBytes,
      packetsPerSecond: recentPackets.length / windowSeconds,
      bytesPerSecond: recentPackets.reduce((sum, p) => sum + p.size, 0) / windowSeconds,
      protocolDistribution,
      suspiciousCount,
      activeConnections: new Set(packets.map((p) => `${p.sourceIp}:${p.sourcePort}-${p.destIp}:${p.destPort}`)).size,
    }
  }, [packets, windowSeconds])
}
