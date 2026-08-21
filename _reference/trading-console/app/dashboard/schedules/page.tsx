"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Calendar, Clock } from "lucide-react"
import { useMemo, useState } from "react"
import { generateSchedules } from "@/lib/trading-mock-data"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState(() => generateSchedules())

  const toggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <Calendar className="w-7 h-7 text-amber-500" />
          Trading Schedules
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Configure when the engine should auto-start and trade
        </p>
      </div>

      {DAYS.map((day, di) => {
        const daySessions = schedules.filter((s) => s.dayOfWeek === di)
        return (
          <Card key={day} className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono">{day}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {daySessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border transition-all ${
                      session.enabled ? "border-amber-500/30 bg-amber-500/5" : "border-border opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold text-foreground">{session.session}</span>
                      <Switch checked={session.enabled} onCheckedChange={() => toggleSchedule(session.id)} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {session.startTime} – {session.endTime} EAT
                    </div>
                    {session.autoStart && (
                      <Badge variant="outline" className="mt-2 text-[8px] font-mono text-blue-400 border-blue-400/30">
                        AUTO-START
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
