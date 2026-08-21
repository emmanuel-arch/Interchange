"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ProtocolBadge } from "./protocol-badge"
import { PacketDetailModal } from "./packet-detail-modal"
import { PacketContextMenu } from "./packet-context-menu"
import { formatTimestamp, formatBytes } from "@/lib/format"
import type { PacketHeader } from "@/lib/types"
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react"

interface PacketStreamProps {
  packets: PacketHeader[]
  maxHeight?: number
}

export function PacketStream({ packets, maxHeight = 600 }: PacketStreamProps) {
  const [selectedPacket, setSelectedPacket] = useState<PacketHeader | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem("packet-view-expanded")
    if (saved !== null) {
      setIsExpanded(saved === "true")
    }
  }, [])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [packets, autoScroll])

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop } = scrollRef.current
      setAutoScroll(scrollTop < 50)
    }
  }

  const handlePacketClick = (packet: PacketHeader) => {
    setSelectedPacket(packet)
    setModalOpen(true)
  }

  const toggleView = () => {
    const newValue = !isExpanded
    setIsExpanded(newValue)
    localStorage.setItem("packet-view-expanded", String(newValue))
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={toggleView} className="gap-2 bg-transparent text-white">
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {isExpanded ? "Compact View" : "Expanded View"}
        </Button>
      </div>

      <Card
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-auto backdrop-blur-sm bg-card/50 border-white/10"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <div className="divide-y divide-white/5">
          {packets.map((packet) => (
            <PacketContextMenu
              key={packet.id}
              packet={packet}
              onViewDetails={() => {
                setSelectedPacket(packet)
                setModalOpen(true)
              }}
            >
              {isExpanded ? (
                <div
                  onClick={() => handlePacketClick(packet)}
                  className={`p-4 hover:bg-white/5 cursor-pointer transition-colors ${
                    packet.isSuspicious ? "bg-red-500/10 border-l-2 border-red-500" : ""
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {packet.isSuspicious && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatTimestamp(packet.timestamp)}
                        </span>
                        <ProtocolBadge protocol={packet.protocol} />
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{formatBytes(packet.size)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Source</div>
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400">{packet.sourceIp}</span>
                          <span className="text-muted-foreground">:</span>
                          <span>{packet.sourcePort}</span>
                        </div>
                        {packet.country && (
                          <div className="text-xs text-muted-foreground">
                            {packet.city}, {packet.country}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Destination</div>
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400">{packet.destIp}</span>
                          <span className="text-muted-foreground">:</span>
                          <span>{packet.destPort}</span>
                        </div>
                      </div>
                    </div>
                    {packet.flags && packet.flags.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Flags:</span>
                        <div className="flex gap-1">
                          {packet.flags.map((flag) => (
                            <span key={flag} className="text-xs px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-300">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => handlePacketClick(packet)}
                  className={`p-3 hover:bg-white/5 cursor-pointer transition-colors ${
                    packet.isSuspicious ? "bg-red-500/10 border-l-2 border-red-500" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {packet.isSuspicious && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {formatTimestamp(packet.timestamp)}
                      </span>
                      <ProtocolBadge protocol={packet.protocol} />
                      <div className="flex items-center gap-2 text-sm font-mono truncate">
                        <span className="text-cyan-400">{packet.sourceIp}</span>
                        <span className="text-muted-foreground">:</span>
                        <span>{packet.sourcePort}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-cyan-400">{packet.destIp}</span>
                        <span className="text-muted-foreground">:</span>
                        <span>{packet.destPort}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">{packet.size} bytes</div>
                  </div>
                </div>
              )}
            </PacketContextMenu>
          ))}
          {packets.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No packets captured yet...</div>
          )}
        </div>
      </Card>

      <PacketDetailModal packet={selectedPacket} open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}
