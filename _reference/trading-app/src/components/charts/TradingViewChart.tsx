"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradingViewChartProps {
  data?: CandleData[];
  height?: number;
  symbol?: string;
  autoResize?: boolean;
}

// Generate realistic XAUUSD 4H candle data for demo
function generateMockCandles(count: number = 100): CandleData[] {
  const candles: CandleData[] = [];
  let price = 2340;
  const now = new Date();

  for (let i = count; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];

    const volatility = 5 + Math.random() * 15;
    const direction = Math.random() > 0.45 ? 1 : -1;
    const change = direction * (Math.random() * volatility);

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.6;
    const low = Math.min(open, close) - Math.random() * volatility * 0.6;

    price = close;

    candles.push({
      time: dateStr,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });
  }

  // Deduplicate by time (keep last entry for each date)
  const deduped = new Map<string, CandleData>();
  candles.forEach((c) => deduped.set(c.time, c));
  return Array.from(deduped.values()).sort((a, b) => a.time.localeCompare(b.time));
}

export default function TradingViewChart({
  data,
  height = 400,
  symbol = "XAUUSD",
  autoResize = true,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#f59e0b", width: 1, style: 2 },
        horzLine: { color: "#f59e0b", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: false,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    seriesRef.current = candleSeries;

    const candles = data || generateMockCandles(100);
    candleSeries.setData(candles as Parameters<typeof candleSeries.setData>[0]);

    // Set current price from last candle
    if (candles.length > 0) {
      setCurrentPrice(candles[candles.length - 1].close);
    }

    // Auto-fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && autoResize) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    if (autoResize) {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (autoResize) {
        window.removeEventListener("resize", handleResize);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, height, autoResize]);

  return (
    <div className="relative">
      {/* Symbol header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{symbol}</span>
          <span className="text-xs text-muted-foreground">4H</span>
        </div>
        {currentPrice !== null && (
          <span className="text-sm font-medium text-gold-400 tabular-nums">
            ${currentPrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden border border-border/30"
        style={{ height }}
      />
    </div>
  );
}
