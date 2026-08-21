"use client";

import EconomicCalendar from "@/components/charts/EconomicCalendar";
import { mockEconomicCalendar } from "@/lib/mock-data";

export default function AdminCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Economic Calendar</h1>
        <p className="text-muted-foreground text-sm">
          High-impact events that trigger trade blocks
        </p>
      </div>

      <EconomicCalendar events={mockEconomicCalendar} />
    </div>
  );
}
