"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Power } from "lucide-react";

interface Props {
  isKilled: boolean;
}

export default function KillSwitch({ isKilled }: Props) {
  const [killed, setKilled] = useState(isKilled);
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const HOLD_DURATION = 3000; // 3 seconds
  const INTERVAL = 50;

  const startHold = useCallback(() => {
    setHolding(true);
    setHoldProgress(0);
    let elapsed = 0;

    intervalRef.current = setInterval(() => {
      elapsed += INTERVAL;
      const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(progress);

      if (elapsed >= HOLD_DURATION) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setKilled((prev) => !prev);
        setHolding(false);
        setHoldProgress(0);

        // In production: call API
        // setKillSwitch(!killed)
      }
    }, INTERVAL);
  }, []);

  const stopHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setHolding(false);
    setHoldProgress(0);
  }, []);

  return (
    <div className="relative">
      <Button
        variant={killed ? "success" : "danger"}
        size="lg"
        className="relative overflow-hidden min-w-[180px]"
        onMouseDown={startHold}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={startHold}
        onTouchEnd={stopHold}
      >
        {/* Progress overlay */}
        {holding && (
          <div
            className="absolute inset-0 bg-white/20 transition-none"
            style={{ width: `${holdProgress}%` }}
          />
        )}

        <span className="relative flex items-center gap-2">
          <Power className="w-4 h-4" />
          {holding
            ? `Hold ${Math.ceil(((100 - holdProgress) / 100) * 3)}s...`
            : killed
            ? "Resume Trading"
            : "KILL SWITCH"}
        </span>
      </Button>

      {/* Status indicator */}
      <div className="absolute -bottom-6 left-0 right-0 text-center">
        <span
          className={`text-[10px] font-medium ${
            killed ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {killed ? "All trading halted" : "Hold 3s to activate"}
        </span>
      </div>
    </div>
  );
}
