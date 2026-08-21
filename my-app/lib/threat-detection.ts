import type { PacketHeader } from "./types"

export interface ThreatRule {
  id: string
  name: string
  description: string
  enabled: boolean
  check: (packets: PacketHeader[], timeWindow: number) => ThreatAlert | null
}

export interface ThreatAlert {
  id: string
  ruleId: string
  severity: "low" | "medium" | "high" | "critical"
  title: string
  description: string
  timestamp: number
  relatedPackets: string[]
}

export const DEFAULT_THREAT_RULES: ThreatRule[] = [
  {
    id: "port-scan",
    name: "Port Scan Detection",
    description: "Detects attempts to scan multiple ports from a single source",
    enabled: true,
    check: (packets, timeWindow) => {
      const now = Date.now()
      const recentPackets = packets.filter((p) => now - p.timestamp < timeWindow)
      const sourcePortMap = new Map<string, Set<number>>()

      recentPackets.forEach((p) => {
        if (!sourcePortMap.has(p.sourceIp)) {
          sourcePortMap.set(p.sourceIp, new Set())
        }
        sourcePortMap.get(p.sourceIp)!.add(p.destPort)
      })

      for (const [sourceIp, ports] of sourcePortMap.entries()) {
        if (ports.size > 10) {
          return {
            id: crypto.randomUUID(),
            ruleId: "port-scan",
            severity: "high",
            title: "Port Scan Detected",
            description: `${sourceIp} attempted to connect to ${ports.size} different ports`,
            timestamp: now,
            relatedPackets: recentPackets.filter((p) => p.sourceIp === sourceIp).map((p) => p.id),
          }
        }
      }
      return null
    },
  },
  {
    id: "ddos",
    name: "DDoS Detection",
    description: "Detects unusually high packet rates from a single source",
    enabled: true,
    check: (packets, timeWindow) => {
      const now = Date.now()
      const recentPackets = packets.filter((p) => now - p.timestamp < timeWindow)
      const sourceCount = new Map<string, number>()

      recentPackets.forEach((p) => {
        sourceCount.set(p.sourceIp, (sourceCount.get(p.sourceIp) || 0) + 1)
      })

      for (const [sourceIp, count] of sourceCount.entries()) {
        if (count > 100) {
          return {
            id: crypto.randomUUID(),
            ruleId: "ddos",
            severity: "critical",
            title: "Potential DDoS Attack",
            description: `${sourceIp} sent ${count} packets in ${timeWindow / 1000}s`,
            timestamp: now,
            relatedPackets: recentPackets.filter((p) => p.sourceIp === sourceIp).map((p) => p.id),
          }
        }
      }
      return null
    },
  },
  {
    id: "suspicious-protocol",
    name: "Suspicious Protocol Activity",
    description: "Detects unusual protocol combinations or uncommon protocols",
    enabled: true,
    check: (packets, timeWindow) => {
      const now = Date.now()
      const recentPackets = packets.filter((p) => now - p.timestamp < timeWindow && p.isSuspicious)

      if (recentPackets.length > 5) {
        return {
          id: crypto.randomUUID(),
          ruleId: "suspicious-protocol",
          severity: "medium",
          title: "Suspicious Protocol Activity",
          description: `${recentPackets.length} suspicious packets detected in ${timeWindow / 1000}s`,
          timestamp: now,
          relatedPackets: recentPackets.map((p) => p.id),
        }
      }
      return null
    },
  },
  {
    id: "repeated-connections",
    name: "Repeated Connection Attempts",
    description: "Detects repeated connection attempts to the same destination",
    enabled: true,
    check: (packets, timeWindow) => {
      const now = Date.now()
      const recentPackets = packets.filter((p) => now - p.timestamp < timeWindow)
      const connectionAttempts = new Map<string, number>()

      recentPackets.forEach((p) => {
        const key = `${p.sourceIp}->${p.destIp}:${p.destPort}`
        connectionAttempts.set(key, (connectionAttempts.get(key) || 0) + 1)
      })

      for (const [connection, count] of connectionAttempts.entries()) {
        if (count > 50) {
          return {
            id: crypto.randomUUID(),
            ruleId: "repeated-connections",
            severity: "medium",
            title: "Repeated Connection Attempts",
            description: `${count} connection attempts: ${connection}`,
            timestamp: now,
            relatedPackets: [],
          }
        }
      }
      return null
    },
  },
]
