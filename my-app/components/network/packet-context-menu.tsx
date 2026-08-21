"use client"

import type React from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Copy, Eye, Ban, Search, MapPin, FileText } from "lucide-react"
import type { PacketHeader } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

interface PacketContextMenuProps {
  packet: PacketHeader
  onViewDetails: () => void
  children: React.ReactNode
}

export function PacketContextMenu({ packet, onViewDetails, children }: PacketContextMenuProps) {
  const { toast } = useToast()

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    })
  }

  const handleInvestigateIP = (ip: string) => {
    window.open(`https://www.whois.com/whois/${ip}`, "_blank")
    toast({
      title: "Investigating IP",
      description: `Opening WHOIS lookup for ${ip}`,
    })
  }

  const handleBlockSource = () => {
    toast({
      title: "Block Source",
      description: `Would block ${packet.sourceIp} (demo mode)`,
      variant: "destructive",
    })
  }

  const handleExportPacket = () => {
    const dataStr = JSON.stringify(packet, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `packet-${packet.id}.json`
    link.click()
    URL.revokeObjectURL(url)

    toast({
      title: "Exported",
      description: "Packet data exported successfully",
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 bg-slate-900 border-slate-700">
        <ContextMenuItem onClick={onViewDetails} className="cursor-pointer">
          <Eye className="mr-2 h-4 w-4" />
          <span>View Details</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-slate-700" />
        <ContextMenuItem onClick={() => copyToClipboard(packet.sourceIp, "Source IP")} className="cursor-pointer">
          <Copy className="mr-2 h-4 w-4" />
          <span>Copy Source IP</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyToClipboard(packet.destIp, "Destination IP")} className="cursor-pointer">
          <Copy className="mr-2 h-4 w-4" />
          <span>Copy Destination IP</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => copyToClipboard(`${packet.sourceIp}:${packet.sourcePort}`, "Source")}
          className="cursor-pointer"
        >
          <Copy className="mr-2 h-4 w-4" />
          <span>Copy Source Address</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-slate-700" />
        <ContextMenuItem onClick={() => handleInvestigateIP(packet.sourceIp)} className="cursor-pointer">
          <Search className="mr-2 h-4 w-4" />
          <span>Investigate Source IP</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleInvestigateIP(packet.destIp)} className="cursor-pointer">
          <MapPin className="mr-2 h-4 w-4" />
          <span>Investigate Dest IP</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-slate-700" />
        <ContextMenuItem onClick={handleExportPacket} className="cursor-pointer">
          <FileText className="mr-2 h-4 w-4" />
          <span>Export Packet</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleBlockSource} className="cursor-pointer text-red-400">
          <Ban className="mr-2 h-4 w-4" />
          <span>Block Source</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
