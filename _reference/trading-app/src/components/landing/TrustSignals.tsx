"use client";

import { motion } from "framer-motion";
import { Shield, BarChart3, Lock, Globe, Cpu, Eye } from "lucide-react";

const signals = [
  {
    icon: Shield,
    title: "Exness Regulated Broker",
    description: "All trades executed on a regulated, globally recognized broker.",
  },
  {
    icon: BarChart3,
    title: "MT5 Verified Trades",
    description: "Every trade verifiable on MetaTrader 5 with real ticket numbers.",
  },
  {
    icon: Eye,
    title: "100% Transparent P&L",
    description: "Full trade history visible to investors. No hidden fees or losses.",
  },
  {
    icon: Lock,
    title: "Secure Infrastructure",
    description: "2FA admin access, encrypted data, and isolated investor pools.",
  },
  {
    icon: Cpu,
    title: "AI-Powered Engine",
    description: "GoldStrike uses ADX + RSI + ATR with adaptive risk management.",
  },
  {
    icon: Globe,
    title: "24/5 Monitoring",
    description: "Automated heartbeat monitoring with instant kill switch capability.",
  },
];

export default function TrustSignals() {
  return (
    <section className="py-20 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Built on{" "}
            <span className="text-gradient-gold">Trust</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Transparency and security are non-negotiable. Here&apos;s how we
            protect your capital.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {signals.map((signal, i) => (
            <motion.div
              key={signal.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass rounded-xl p-6 group hover:border-gold-500/20 transition-all duration-300"
            >
              <signal.icon className="w-8 h-8 text-gold-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-base font-semibold text-foreground mb-2">
                {signal.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {signal.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
