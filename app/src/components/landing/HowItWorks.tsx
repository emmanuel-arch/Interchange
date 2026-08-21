"use client";

import { motion } from "framer-motion";
import { UserPlus, BarChart3, Banknote } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    title: "Apply & Get Approved",
    description:
      "Submit your investor application with KYC details. Our team reviews and approves within 24-48 hours.",
    color: "text-gold-400",
    bg: "bg-gold-500/10",
  },
  {
    icon: Banknote,
    title: "Deposit Capital",
    description:
      "Fund your trading pool via M-Pesa or bank transfer. Your capital is allocated to GoldStrike's managed pool.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: BarChart3,
    title: "Watch It Grow",
    description:
      "Track your returns in real-time. Monthly profit distributions at 70/30 split. Full transparency, always.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            How It{" "}
            <span className="text-gradient-gold">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Three simple steps to start earning from AI-powered gold trading.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-px bg-gradient-to-r from-gold-500/0 via-gold-500/30 to-gold-500/0" />

          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative text-center"
            >
              {/* Step number */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-gold-600 text-white text-xs font-bold flex items-center justify-center z-10 shadow-lg shadow-gold-500/30">
                {i + 1}
              </div>

              <div className="glass rounded-2xl p-8 pt-10 hover:border-gold-500/20 transition-all duration-300 group h-full">
                <div
                  className={`w-14 h-14 rounded-2xl ${step.bg} flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform`}
                >
                  <step.icon className={`w-7 h-7 ${step.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
