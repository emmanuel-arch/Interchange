"use client";

import { useQuery } from "@tanstack/react-query";
import type { EconomicEvent } from "@/types";
import { mockEconomicCalendar } from "@/lib/mock-data";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

async function fetchCalendar(): Promise<EconomicEvent[]> {
  if (USE_MOCK) return mockEconomicCalendar;
  const res = await fetch("/api/calendar");
  if (!res.ok) throw new Error("Failed to fetch calendar");
  return res.json();
}

export function useEconomicCalendar() {
  return useQuery({
    queryKey: ["economic-calendar"],
    queryFn: fetchCalendar,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
  });
}

export function useBlockedEvents() {
  const { data, ...rest } = useEconomicCalendar();
  return {
    data: data?.filter((e) => e.isBlocked) || [],
    ...rest,
  };
}

export function useUpcomingEvents(days: number = 7) {
  const { data, ...rest } = useEconomicCalendar();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return {
    data:
      data?.filter((e) => {
        const eventDate = new Date(e.date);
        return eventDate <= cutoff;
      }) || [],
    ...rest,
  };
}
