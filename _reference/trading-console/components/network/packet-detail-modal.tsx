"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProtocolBadge } from "./protocol-badge"
import { formatBytes, formatTimestamp } from "@/lib/format"
import type { PacketHeader } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

interface PacketDetailModalProps {
  packet: PacketHeader | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PacketDetailModal({ packet, open, onOpenChange }: PacketDetailModalProps) {
  if (!packet) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Packet Details
            {packet.isSuspicious && (
              <Badge variant="destructive" className="ml-2">
                Suspicious
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 font-mono text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-muted-foreground mb-1">Protocol</div>
              <ProtocolBadge protocol={packet.protocol} />
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Timestamp</div>
              <div>{formatTimestamp(packet.timestamp)}</div>
            </div>
          </div>

          <div className="space-y-3 p-4 rounded-lg bg-black/20 border border-white/5">
            <h3 className="font-semibold text-foreground">Network Layer</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground text-xs mb-1">Source IP</div>
                <div className="text-cyan-400">{packet.sourceIp}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">Destination IP</div>
                <div className="text-cyan-400">{packet.destIp}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">Source Port</div>
                <div>{packet.sourcePort}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">Destination Port</div>
                <div>{packet.destPort}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4 rounded-lg bg-black/20 border border-white/5">
            <h3 className="font-semibold text-foreground">Packet Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground text-xs mb-1">Size</div>
                <div>{formatBytes(packet.size)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">TTL</div>
                <div>{packet.ttl}</div>
              </div>
              {packet.flags.length > 0 && (
                <div className="col-span-2">
                  <div className="text-muted-foreground text-xs mb-1">Flags</div>
                  <div className="flex gap-1">
                    {packet.flags.map((flag) => (
                      <span key={flag} className="px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-xs">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {(packet.country || packet.city) && (
            <div className="space-y-3 p-4 rounded-lg bg-black/20 border border-white/5">
              <h3 className="font-semibold text-foreground">Geolocation</h3>
              <div className="grid grid-cols-2 gap-3">
                {packet.city && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">City</div>
                    <div>{packet.city}</div>
                  </div>
                )}
                {packet.country && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Country</div>
                    <div>{packet.country}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
