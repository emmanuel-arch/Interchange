"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SSEEvent } from "@/types";

interface UseSSEOptions {
  url: string;
  onMessage?: (event: SSEEvent) => void;
  onError?: (error: Event) => void;
  enabled?: boolean;
  reconnectDelay?: number;
  maxRetries?: number;
}

export function useSSE({
  url,
  onMessage,
  onError,
  enabled = true,
  reconnectDelay = 3000,
  maxRetries = 5,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        // Non-JSON message (e.g., heartbeat pings)
      }
    };

    eventSource.onerror = (error) => {
      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      onError?.(error);

      // Attempt reconnect with exponential backoff
      if (retriesRef.current < maxRetries) {
        const delay = reconnectDelay * Math.pow(2, retriesRef.current);
        retriesRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };
  }, [url, enabled, onMessage, onError, reconnectDelay, maxRetries]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  return { isConnected, disconnect };
}
