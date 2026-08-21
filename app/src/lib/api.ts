import axios from "axios";
import type { ApiResponse, EngineStatus, Trade, EngineConfigItem } from "@/types";

const CONTROL_SERVER = process.env.NEXT_PUBLIC_CONTROL_SERVER_URL || "http://45.150.190.19:5000";

const api = axios.create({
  baseURL: CONTROL_SERVER,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("control-server-token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// --- Engine ---
export async function getEngineStatus(): Promise<ApiResponse<EngineStatus>> {
  const res = await api.get("/api/engine/status");
  return res.data;
}

export async function setKillSwitch(enabled: boolean): Promise<ApiResponse> {
  const res = await api.post("/api/engine/kill-switch", { enabled });
  return res.data;
}

export async function getEngineConfig(): Promise<ApiResponse<EngineConfigItem[]>> {
  const res = await api.get("/api/engine/config");
  return res.data;
}

export async function updateEngineConfig(key: string, value: unknown): Promise<ApiResponse> {
  const res = await api.put("/api/engine/config", { key, value });
  return res.data;
}

// --- Trades ---
export async function getOpenTrades(): Promise<ApiResponse<Trade[]>> {
  const res = await api.get("/api/trades/open");
  return res.data;
}

export async function getClosedTrades(limit = 50): Promise<ApiResponse<Trade[]>> {
  const res = await api.get(`/api/trades/closed?limit=${limit}`);
  return res.data;
}

// --- Backtest ---
export async function triggerBacktest(params: Record<string, unknown>): Promise<ApiResponse> {
  const res = await api.post("/api/backtest/run", params);
  return res.data;
}

// --- Telegram ---
export async function sendTelegramMessage(message: string, target: "investors" | "subscribers" | "all"): Promise<ApiResponse> {
  const res = await api.post("/api/telegram/send", { message, target });
  return res.data;
}

// --- SSE Connection to Next.js API route (proxied) ---
export function createSSEConnection(
  endpoint: string,
  onMessage: (event: MessageEvent) => void,
  onError?: (event: Event) => void
): EventSource {
  const eventSource = new EventSource(endpoint);
  eventSource.onmessage = onMessage;
  if (onError) eventSource.onerror = onError;
  return eventSource;
}

export default api;
