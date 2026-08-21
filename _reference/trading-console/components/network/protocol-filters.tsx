"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Protocol } from "@/lib/types"
import { getProtocolColor } from "@/lib/format"

const ALL_PROTOCOLS: Protocol[] = ["TCP", "UDP", "HTTP", "HTTPS", "DNS", "ICMP", "SSH", "FTP"]

interface ProtocolFiltersProps {
  activeFilters: Set<Protocol>
  onToggleFilter: (protocol: Protocol) => void
  onClearFilters: () => void
}

export function ProtocolFilters({ activeFilters, onToggleFilter, onClearFilters }: ProtocolFiltersProps) {
  return (
    <Card className="p-4 backdrop-blur-sm bg-card/50 border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Protocol Filters</h3>
        {activeFilters.size > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 text-xs">
            Clear All
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_PROTOCOLS.map((protocol) => {
          const isActive = activeFilters.has(protocol)
          return (
            <Button
              key={protocol}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onToggleFilter(protocol)}
              className={`h-8 font-mono text-xs ${isActive ? "" : "bg-transparent hover:bg-white/10"}`}
            >
              <span className={isActive ? "" : getProtocolColor(protocol)}>{protocol}</span>
              {isActive && (
                <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                  Active
                </Badge>
              )}
            </Button>
          )
        })}
      </div>
    </Card>
  )
}
