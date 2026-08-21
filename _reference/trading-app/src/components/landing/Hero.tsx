"use client";

import { motion } from "framer-motion";
import { TrendingUp, ArrowRight, Shield, BarChart3, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gold-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(245,158,11,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.3) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — Copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-gold text-gold-400 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Trading — Engine Online
            </div>

            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              <span className="text-gradient-gold">AI-Powered</span>
              <br />
              <span className="text-foreground">Gold Trading.</span>
              <br />
              <span className="text-foreground">Proven Returns.</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-md">
              GoldStrike uses advanced algorithmic strategies on XAUUSD to
              deliver consistent, transparent returns. Verified on MT5, powered
              by BirgenAI.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="#waitlist">
                <Button variant="gold" size="xl" className="group">
                  Start Investing
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="#performance">
                <Button variant="outline" size="xl">
                  View Performance
                </Button>
              </Link>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-6 pt-4">
              {[
                { icon: Shield, label: "MT5 Verified" },
                { icon: BarChart3, label: "66.5% Win Rate" },
                { icon: Zap, label: "Exness Regulated" },
              ].map((badge) => (
                <div
                  key={badge.label}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <badge.icon className="w-4 h-4 text-gold-400" />
                  {badge.label}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — Live stats card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="glass rounded-2xl p-6 space-y-6 border border-gold-500/10">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-amber-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      XAUUSD Performance
                    </p>
                    <p className="text-xs text-muted-foreground">
                      April 2026 · Live
                    </p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total Return" value="+134.8%" positive />
                <StatCard label="This Month" value="+6.2%" positive />
                <StatCard label="Win Rate" value="66.5%" />
                <StatCard label="Profit Factor" value="1.82" />
                <StatCard label="Sharpe Ratio" value="2.14" />
                <StatCard label="Max Drawdown" value="8.9%" negative />
              </div>

              {/* Monthly bars preview */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Monthly Returns</p>
                <div className="flex items-end gap-1 h-16">
                  {[12.4, 8.7, 15.2, -3.8, 11.1, 14.8, 10.2, 13.6, 11.9, 6.2].map(
                    (ret, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm transition-all duration-300"
                        style={{
                          height: `${Math.abs(ret) * 4}px`,
                          backgroundColor:
                            ret >= 0
                              ? "rgba(16, 185, 129, 0.6)"
                              : "rgba(239, 68, 68, 0.6)",
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute -inset-4 bg-gold-500/5 rounded-3xl blur-2xl -z-10" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${
          positive
            ? "text-emerald-400"
            : negative
            ? "text-red-400"
            : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
