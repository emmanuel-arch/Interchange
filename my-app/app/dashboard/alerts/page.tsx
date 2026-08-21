"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Bell, CheckCircle2, Trash2, Filter } from "lucide-react"
import { generateAlertHistory, generateAlert } from "@/lib/trading-mock-data"
import type { PlatformAlert, AlertSeverity } from "@/lib/trading-types"

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PlatformAlert[]>(generateAlertHistory(20))
  const [filter, setFilter] = useState<AlertSeverity | "ALL">("ALL")

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        setAlerts((prev) => [generateAlert(), ...prev].slice(0, 100))
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const filtered = filter === "ALL" ? alerts : alerts.filter((a) => a.severity === filter)
  const undismissed = alerts.filter((a) => !a.dismissed).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
            Alerts Center
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {undismissed} active alerts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs font-mono" onClick={() => setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })))}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Dismiss All
          </Button>
          <Button variant="outline" size="sm" className="text-xs font-mono" onClick={() => setAlerts([])}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["ALL", "CRITICAL", "WARNING", "SUCCESS", "INFO"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className={`text-xs font-mono ${filter === f ? "" : "bg-transparent"}`}
            onClick={() => setFilter(f)}
          >
            {f}
            {f !== "ALL" && (
              <span className="ml-1 text-[9px]">
                ({alerts.filter((a) => a.severity === f).length})
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-2">
        {filtered.map((alert) => (
          <Card
            key={alert.id}
            className={`bg-card border transition-all ${
              alert.dismissed ? "opacity-50" : ""
            } ${
              alert.severity === "CRITICAL"
                ? "border-red-500/30"
                : alert.severity === "WARNING"
                ? "border-amber-500/30"
                : alert.severity === "SUCCESS"
                ? "border-green-500/30"
                : "border-border"
            }`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  alert.severity === "CRITICAL" ? "bg-red-500" :
                  alert.severity === "WARNING" ? "bg-amber-500" :
                  alert.severity === "SUCCESS" ? "bg-green-500" : "bg-blue-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-mono font-semibold text-foreground">{alert.title}</span>
                    <Badge variant="outline" className="text-[8px] font-mono text-muted-foreground">{alert.category}</Badge>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{alert.message}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground">
                    {alert.source}
                  </div>
                </div>
                {!alert.dismissed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-6 w-6 p-0"
                    onClick={() => setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, dismissed: true } : a))}
                  >
                    <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
