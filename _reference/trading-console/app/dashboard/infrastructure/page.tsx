"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Server, Cpu, HardDrive, MemoryStick, Wifi, WifiOff, Activity,
  CheckCircle2, XCircle, AlertTriangle, Radio, Clock
} from "lucide-react"
import { generateInfraNodes } from "@/lib/trading-mock-data"
import type { InfraNode, InfraService } from "@/lib/trading-types"

export default function InfrastructurePage() {
  const [nodes, setNodes] = useState<InfraNode[]>(generateInfraNodes())

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(generateInfraNodes())
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const allHealthy = nodes.every((n) => n.status === "HEALTHY")

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Server className="w-7 h-7 text-amber-500" />
            System Health
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Infrastructure monitoring — 4 nodes
          </p>
        </div>
        <Badge
          variant="outline"
          className={`font-mono text-xs ${allHealthy ? "text-green-400 border-green-400/30" : "text-amber-400 border-amber-400/30"}`}
        >
          {allHealthy ? "ALL SYSTEMS OPERATIONAL" : "DEGRADED"}
        </Badge>
      </div>

      {/* Topology Graphic */}
      <Card className="bg-card border-border">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {nodes.map((node, i) => (
              <div key={node.id} className="flex items-center gap-4">
                <div
                  className={`p-4 rounded-xl border-2 text-center transition-all min-w-[140px] ${
                    node.status === "HEALTHY"
                      ? "border-green-500/30 bg-green-500/5"
                      : node.status === "WARNING"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${
                    node.status === "HEALTHY" ? "bg-green-500 animate-pulse" : node.status === "WARNING" ? "bg-amber-500" : "bg-red-500"
                  }`} />
                  <div className="text-xs font-mono font-semibold text-foreground">{node.name}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{node.ip}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{node.latencyMs}ms</div>
                </div>
                {i < nodes.length - 1 && (
                  <div className="text-muted-foreground hidden md:block">
                    <Activity className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Node Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {nodes.map((node) => (
          <Card key={node.id} className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    node.status === "HEALTHY" ? "bg-green-500" : node.status === "WARNING" ? "bg-amber-500" : "bg-red-500"
                  }`} />
                  {node.name}
                </CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground">
                  {node.ip}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Resource Meters */}
              <div className="grid grid-cols-3 gap-3">
                <ResourceMeter label="CPU" value={node.cpuPercent} />
                <ResourceMeter label="Memory" value={node.memoryPercent} />
                <ResourceMeter label="Disk" value={node.diskPercent} />
              </div>

              <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
                <span>Uptime: {formatUptime(node.uptime)}</span>
                <span>Latency: {node.latencyMs}ms</span>
                <span>Ping: {new Date(node.lastPing).toLocaleTimeString()}</span>
              </div>

              {/* Services */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Services</span>
                {node.services.map((svc) => (
                  <div key={svc.name} className="flex items-center gap-2 p-2 rounded bg-muted/20 text-xs font-mono">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      svc.status === "RUNNING" ? "bg-green-500" : svc.status === "STOPPED" ? "bg-amber-500" : "bg-red-500"
                    }`} />
                    <span className="text-foreground flex-1">{svc.name}</span>
                    {svc.port > 0 && <span className="text-muted-foreground">:{svc.port}</span>}
                    {svc.memoryMb !== undefined && svc.memoryMb > 0 && <span className="text-muted-foreground">{svc.memoryMb}MB</span>}
                    <Badge variant="outline" className={`text-[8px] ${
                      svc.status === "RUNNING" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"
                    }`}>
                      {svc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function ResourceMeter({ label, value }: { label: string; value: number }) {
  const color = value < 50 ? "bg-green-500" : value < 80 ? "bg-amber-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono text-foreground">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  return `${h}h ${Math.floor((seconds % 3600) / 60)}m`
}
