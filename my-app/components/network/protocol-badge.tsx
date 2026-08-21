import { getProtocolBgColor, getProtocolColor } from "@/lib/format"
import type { Protocol } from "@/lib/types"

interface ProtocolBadgeProps {
  protocol: Protocol
  className?: string
}

export function ProtocolBadge({ protocol, className = "" }: ProtocolBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${getProtocolBgColor(protocol)} ${getProtocolColor(protocol)} ${className}`}
    >
      {protocol}
    </span>
  )
}
