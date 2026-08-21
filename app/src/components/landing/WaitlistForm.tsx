"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, CheckCircle, ArrowRight } from "lucide-react";

export default function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [investmentRange, setInvestmentRange] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, investmentRange }),
      });
      if (res.ok) setSubmitted(true);
    } catch {
      // Silently handle — form still shows
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <section id="waitlist" className="py-20 bg-background">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass rounded-2xl p-12 border-emerald-500/20"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-3">
              You&apos;re on the List!
            </h3>
            <p className="text-muted-foreground">
              We&apos;ll review your application and reach out within 24-48
              hours. Check your email for updates.
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-20 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-2xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Ready to{" "}
            <span className="text-gradient-gold">Invest</span>?
          </h2>
          <p className="text-muted-foreground">
            Apply to join our managed gold trading pool. Limited spots
            available.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          onSubmit={handleSubmit}
          className="glass rounded-2xl p-8 space-y-5"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Full Name
              </label>
              <Input
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background"
                required
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Phone Number
              </label>
              <Input
                type="tel"
                placeholder="0712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Investment Range
              </label>
              <select
                value={investmentRange}
                onChange={(e) => setInvestmentRange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select...</option>
                <option value="500-2000">$500 - $2,000</option>
                <option value="2000-5000">$2,000 - $5,000</option>
                <option value="5000-10000">$5,000 - $10,000</option>
                <option value="10000+">$10,000+</option>
              </select>
            </div>
          </div>

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full group"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Apply to Invest
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By applying, you agree to our terms. Minimum investment: $500.
            Trading involves risk.
          </p>
        </motion.form>
      </div>
    </section>
  );
}
