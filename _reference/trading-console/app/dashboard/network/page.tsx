"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PacketStream } from "@/components/network/packet-stream"
import { PacketSearch } from "@/components/network/packet-search"
import { StatisticsChart } from "@/components/network/statistics-chart"
import { ProtocolFilters } from "@/components/network/protocol-filters"
import { ConnectionTracker } from "@/components/network/connection-tracker"
import { StatsOverview } from "@/components/network/stats-overview"
import { AdvancedStatsDashboard } from "@/components/network/advanced-stats-dashboard"
import { BandwidthMeter } from "@/components/network/bandwidth-meter"
import { TrafficMap } from "@/components/network/traffic-map"
import { TrafficHeatmap } from "@/components/network/traffic-heatmap"
import { ReplayControls } from "@/components/network/replay-controls"
import { usePacketStream } from "@/hooks/use-packet-stream"
import { useTrafficStats } from "@/hooks/use-traffic-stats"
import { usePacketReplay } from "@/hooks/use-packet-replay"
import { generateConnection } from "@/lib/packet-generator"
import type { Connection } from "@/lib/types"
import { Play, Pause, Trash2, Download, Activity, Film, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ThreatAlerts } from "@/components/network/threat-alerts"
import { useThreatDetection } from "@/hooks/use-threat-detection"

export default function NetworkMonitorPage() {
  const {
    packets,
    allPackets,
    activeFilters,
    searchQuery,
    isPaused,
    toggleFilter,
    clearFilters,
    setSearchQuery,
    togglePause,
    clearPackets,
  } = usePacketStream(300)

  const stats = useTrafficStats(allPackets)
  const [connections, setConnections] = useState<Connection[]>([])
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("live")

  const replay = usePacketReplay(allPackets)
  const displayPackets = replay.isReplayMode ? replay.replayPackets : packets

  useEffect(() => {
    const interval = setInterval(() => {
      setConnections((prev) => {
        const newConnections = [...prev]
        if (Math.random() > 0.7 && newConnections.length < 15) {
          newConnections.push(generateConnection())
        }
        return newConnections.filter((c) => Date.now() - c.lastActivity < 60000)
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const lastSuspiciousPacketRef = useRef<string | null>(null)

  useEffect(() => {
    const suspiciousPackets = packets.filter((p) => p.isSuspicious)
    if (suspiciousPackets.length > 0) {
      const latest = suspiciousPackets[0]
      const packetId = `${latest.timestamp}-${latest.sourceIp}-${latest.destIp}`
      if (packetId !== lastSuspiciousPacketRef.current) {
        lastSuspiciousPacketRef.current = packetId
        toast({
          title: "Suspicious Activity Detected",
          description: `${latest.protocol} packet from ${latest.sourceIp}`,
          variant: "destructive",
        })
      }
    }
  }, [packets.length])

  const handleExport = () => {
    const dataStr = JSON.stringify(allPackets, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `network-capture-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export Complete", description: `Exported ${allPackets.length} packets` })
  }

  const maxBandwidth = 100000
  const { alerts, dismissAlert, clearAllAlerts } = useThreatDetection(allPackets)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Activity className="w-7 h-7 text-amber-500" />
            Network Monitor
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Infrastructure traffic analysis • {allPackets.length} packets captured
          </p>
        </div>
        <div className="flex gap-2">
          {!replay.isReplayMode ? (
            <>
              <Button variant="outline" size="sm" onClick={togglePause} className="gap-2 text-xs font-mono">
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button variant="outline" size="sm" onClick={clearPackets} className="gap-2 text-xs font-mono">
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={replay.enterReplayMode} className="gap-2 text-xs font-mono" disabled={allPackets.length === 0}>
                <Film className="w-3.5 h-3.5" />
                Replay
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={replay.exitReplayMode} className="gap-2 text-xs font-mono">
              <X className="w-3.5 h-3.5" />
              Exit Replay
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 text-xs font-mono">
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
        </div>
      </div>

      <StatsOverview stats={stats} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1 flex justify-center">
          <BandwidthMeter label="Download" value={stats.bytesPerSecond} max={maxBandwidth} color="stroke-blue-500" />
        </div>
        <div className="col-span-2 md:col-span-1 flex justify-center">
          <BandwidthMeter label="Upload" value={stats.bytesPerSecond * 0.4} max={maxBandwidth} color="stroke-green-500" />
        </div>
        <div className="col-span-2 md:col-span-2">
          <ProtocolFilters activeFilters={activeFilters} onToggleFilter={toggleFilter} onClearFilters={clearFilters} />
        </div>
      </div>

      {replay.isReplayMode && (
        <ReplayControls
          isPlaying={replay.isPlaying}
          currentIndex={replay.currentIndex}
          totalPackets={allPackets.length}
          playbackSpeed={replay.playbackSpeed}
          onPlay={replay.play}
          onPause={replay.pause}
          onReset={replay.reset}
          onStepBackward={replay.stepBackward}
          onStepForward={replay.stepForward}
          onSpeedChange={replay.setPlaybackSpeed}
          onSeek={replay.seek}
        />
      )}

      <PacketSearch value={searchQuery} onChange={setSearchQuery} />

      <ThreatAlerts alerts={alerts} onDismiss={dismissAlert} onClearAll={clearAllAlerts} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="live" className="font-mono text-xs">Live Stream</TabsTrigger>
          <TabsTrigger value="connections" className="font-mono text-xs">Connections</TabsTrigger>
          <TabsTrigger value="chart" className="font-mono text-xs">Statistics</TabsTrigger>
          <TabsTrigger value="map" className="font-mono text-xs">Traffic Map</TabsTrigger>
          <TabsTrigger value="heatmap" className="font-mono text-xs">Heatmap</TabsTrigger>
          <TabsTrigger value="advanced" className="font-mono text-xs">Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <PacketStream packets={displayPackets} />
        </TabsContent>
        <TabsContent value="connections">
          <ConnectionTracker connections={connections} />
        </TabsContent>
        <TabsContent value="chart">
          <StatisticsChart packets={allPackets} />
        </TabsContent>
        <TabsContent value="map">
          <TrafficMap packets={allPackets} />
        </TabsContent>
        <TabsContent value="heatmap">
          <TrafficHeatmap packets={allPackets} />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedStatsDashboard stats={stats} packets={allPackets} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
