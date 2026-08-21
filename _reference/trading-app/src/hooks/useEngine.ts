"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EngineStatus, EngineConfigItem } from "@/types";
import { mockEngineStatus, mockEngineConfig } from "@/lib/mock-data";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

async function fetchEngineStatus(): Promise<EngineStatus> {
  if (USE_MOCK) return mockEngineStatus;
  const res = await fetch("/api/engine/status");
  if (!res.ok) throw new Error("Failed to fetch engine status");
  return res.json();
}

async function fetchEngineConfig(): Promise<EngineConfigItem[]> {
  if (USE_MOCK) return mockEngineConfig;
  const res = await fetch("/api/engine/config");
  if (!res.ok) throw new Error("Failed to fetch engine config");
  return res.json();
}

async function toggleKillSwitch(active: boolean): Promise<void> {
  const res = await fetch("/api/engine/kill-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Failed to toggle kill switch");
}

async function updateConfig(
  items: { key: string; value: string | number | boolean }[]
): Promise<void> {
  const res = await fetch("/api/engine/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error("Failed to update config");
}

export function useEngineStatus() {
  return useQuery({
    queryKey: ["engine-status"],
    queryFn: fetchEngineStatus,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useEngineConfig() {
  return useQuery({
    queryKey: ["engine-config"],
    queryFn: fetchEngineConfig,
    staleTime: 10000,
  });
}

export function useKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleKillSwitch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engine-status"] });
    },
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engine-config"] });
    },
  });
}
