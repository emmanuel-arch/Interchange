"use client";

import { motion } from "framer-motion";
import { mockBacktestResult } from "@/lib/mock-data";
import { BarChart3, TrendingUp, Shield, Target } from "lucide-react";

export default function BacktestCarousel() {
  const bt = mockBacktestResult;

  const stats = [
    {
      icon: TrendingUp,
      label: "Win Rate",
      value: `${bt.winRate}%`,
      description: "Percentage of winning trades",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      icon: BarChart3,
      label: "Profit Factor",
      value: bt.profitFactor.toFixed(2),
      description: "Gross profit / gross loss ratio",
      color: "text-gold-400",
      bg: "bg-gold-500/10",
    },
    {
      icon: Target,
      label: "Sharpe Ratio",
      value: bt.sharpeRatio.toFixed(2),
      description: "Risk-adjusted return metric",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      icon: Shield,
      label: "Max Drawdown",
      value: `${bt.maxDrawdown}%`,
      description: "Largest peak-to-trough decline",
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
  ];

  return (
    <section id="performance" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Backtested &{" "}
            <span className="text-gradient-gold">Verified</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {bt.totalTrades} trades analyzed from {bt.startDate} to {bt.endDate}.
            Starting with ${bt.initialBalance.toLocaleString()}, ending at $
            {bt.finalBalance.toLocaleString()}.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-xl p-6 text-center hover:border-gold-500/20 transition-all duration-300 group"
            >
              <div
                className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}
              >
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                {stat.label}
              </p>
              <p className={`text-3xl font-bold ${stat.color} tabular-nums`}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {stat.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Monthly returns bar chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 glass rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-foreground mb-6">
            Monthly Returns (%)
          </h3>
          <div className="flex items-end gap-2 h-48">
            {Object.entries(bt.monthlyReturns).map(([month, ret]) => {
              const maxAbsReturn = Math.max(
                ...Object.values(bt.monthlyReturns).map(Math.abs)
              );
              const heightPct = (Math.abs(ret) / maxAbsReturn) * 100;

              return (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      ret >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {ret >= 0 ? "+" : ""}
                    {ret.toFixed(1)}%
                  </span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      ret >= 0
                        ? "bg-gradient-to-t from-emerald-600 to-emerald-400"
                        : "bg-gradient-to-t from-red-600 to-red-400"
                    }`}
                    style={{ height: `${heightPct}%`, minHeight: "8px" }}
                  />
                  <span className="text-[10px] text-muted-foreground rotate-0">
                    {month.split("-")[1]}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Target line */}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-8 h-px bg-gold-400" />
            <span>10% monthly target</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
