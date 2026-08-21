"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, AlertCircle, Info, XCircle, X } from "lucide-react"
import type { ThreatAlert } from "@/lib/threat-detection"
import { formatTimestamp } from "@/lib/format"

interface ThreatAlertsProps {
  alerts: ThreatAlert[]
  onDismiss: (alertId: string) => void
  onClearAll: () => void
}

export function ThreatAlerts({ alerts, onDismiss, onClearAll }: ThreatAlertsProps) {
  const getSeverityIcon = (severity: ThreatAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return <XCircle className="w-5 h-5 text-red-500" />
      case "high":
        return <AlertTriangle className="w-5 h-5 text-orange-500" />
      case "medium":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case "low":
        return <Info className="w-5 h-5 text-blue-500" />
    }
  }

  const getSeverityColor = (severity: ThreatAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-300 border-red-500/50"
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/50"
      case "medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/50"
      case "low":
        return "bg-blue-500/20 text-blue-300 border-blue-500/50"
    }
  }

  if (alerts.length === 0) {
    return (
      <Card className="backdrop-blur-sm bg-card/50 border-white/10">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">No active threats detected</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="backdrop-blur-sm bg-card/50 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Threat Alerts ({alerts.length})
          </CardTitle>
          {alerts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAll} className="h-7 text-xs">
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)} relative group`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDismiss(alert.id)}
              className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </Button>
            <div className="flex items-start gap-3">
              {getSeverityIcon(alert.severity)}
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{alert.title}</h4>
                  <Badge variant="outline" className="text-xs">
                    {alert.severity.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{alert.description}</p>
                <p className="text-xs text-muted-foreground font-mono">{formatTimestamp(alert.timestamp)}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
