"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Shield, Clock, AlertTriangle } from "lucide-react";
import type { EconomicEvent } from "@/types";

interface EconomicCalendarProps {
  events: EconomicEvent[];
}

const impactColors = {
  high: "text-red-400 bg-red-400/10",
  medium: "text-orange-400 bg-orange-400/10",
  low: "text-blue-400 bg-blue-400/10",
};

export default function EconomicCalendar({ events }: EconomicCalendarProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gold-400" />
            Economic Calendar
          </CardTitle>
          <Badge variant="secondary">
            {events.filter((e) => e.isBlocked).length} blocked
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.map((event) => (
            <div
              key={event.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                event.isBlocked
                  ? "border-red-500/20 bg-red-500/5"
                  : "border-border/50 bg-slate-800/20 hover:bg-slate-800/40"
              }`}
            >
              {/* Impact indicator */}
              <div
                className={`p-1.5 rounded-md ${impactColors[event.impact]}`}
              >
                {event.impact === "high" ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Event details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {event.event}
                  </span>
                  {event.isBlocked && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1.5 py-0 gap-0.5"
                    >
                      <Shield className="w-2.5 h-2.5" />
                      Blocked
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{event.currency}</span>
                  <span>·</span>
                  <span>
                    {new Date(event.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span>·</span>
                  <span>{event.time}</span>
                </div>
              </div>

              {/* Forecast vs Previous */}
              <div className="hidden sm:flex gap-4 text-xs">
                <div className="text-right">
                  <span className="text-muted-foreground block">Forecast</span>
                  <span className="text-foreground font-medium tabular-nums">
                    {event.forecast}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block">Previous</span>
                  <span className="text-foreground font-medium tabular-nums">
                    {event.previous}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
