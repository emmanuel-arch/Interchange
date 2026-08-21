"use client";

import { useQuery } from "@tanstack/react-query";
import type { Trade } from "@/types";
import { mockOpenTrades, mockClosedTrades } from "@/lib/mock-data";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

interface TradesResponse {
  open: Trade[];
  closed: Trade[];
}

async function fetchTrades(): Promise<TradesResponse> {
  if (USE_MOCK) {
    return { open: mockOpenTrades, closed: mockClosedTrades };
  }
  const res = await fetch("/api/trades");
  if (!res.ok) throw new Error("Failed to fetch trades");
  return res.json();
}

export function useTrades() {
  return useQuery({
    queryKey: ["trades"],
    queryFn: fetchTrades,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useOpenTrades() {
  const { data, ...rest } = useTrades();
  return { data: data?.open || [], ...rest };
}

export function useClosedTrades() {
  const { data, ...rest } = useTrades();
  return { data: data?.closed || [], ...rest };
}
