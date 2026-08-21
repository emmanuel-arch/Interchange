"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Phone,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { formatUSD, formatKES } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "deposit" | "withdraw";

const EXCHANGE_RATE = 153.5; // USD → KES (approximate)

export default function DepositWithdrawal() {
  const [activeTab, setActiveTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stkPushSent, setStkPushSent] = useState(false);

  const amountUSD = parseFloat(amount) || 0;
  const amountKES = amountUSD * EXCHANGE_RATE;

  const handleDeposit = async () => {
    if (!amount || amountUSD < 10) {
      toast.error("Minimum deposit is $10");
      return;
    }
    if (!phone || phone.length < 10) {
      toast.error("Enter a valid M-Pesa phone number");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/payments/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(amountKES),
          phone: phone.startsWith("0") ? `254${phone.slice(1)}` : phone,
          type: "deposit",
        }),
      });

      if (!response.ok) throw new Error("STK push failed");

      setStkPushSent(true);
      toast.success("M-Pesa prompt sent! Check your phone.");
    } catch {
      toast.error("Failed to initiate M-Pesa payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!amount || amountUSD < 10) {
      toast.error("Minimum withdrawal is $10");
      return;
    }
    if (!phone || phone.length < 10) {
      toast.error("Enter your M-Pesa phone number");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/payments/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountUSD,
          phone: phone.startsWith("0") ? `254${phone.slice(1)}` : phone,
        }),
      });

      if (!response.ok) throw new Error("Withdrawal request failed");

      toast.success("Withdrawal request submitted for admin review");
      setAmount("");
      setPhone("");
    } catch {
      toast.error("Failed to submit withdrawal request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gold-400" />
          Deposit & Withdraw
        </CardTitle>

        {/* Tab buttons */}
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => {
              setActiveTab("deposit");
              setStkPushSent(false);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "deposit"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-slate-800"
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Deposit
          </button>
          <button
            onClick={() => {
              setActiveTab("withdraw");
              setStkPushSent(false);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "withdraw"
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-slate-800"
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Withdraw
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {stkPushSent ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-semibold text-foreground">
              M-Pesa Prompt Sent
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Enter your M-Pesa PIN on your phone to complete the payment of{" "}
              <span className="text-gold-400 font-medium">
                {formatKES(amountKES)}
              </span>{" "}
              (~{formatUSD(amountUSD)})
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStkPushSent(false);
                setAmount("");
                setPhone("");
              }}
            >
              New Transaction
            </Button>
          </div>
        ) : (
          <div className="max-w-md space-y-4">
            {/* Amount input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Amount (USD)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={10}
                  step={10}
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-9 bg-slate-800/50 border-slate-700 focus:border-gold-500 tabular-nums"
                />
              </div>
              {amountUSD > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatKES(amountKES)} (rate: 1 USD = {EXCHANGE_RATE} KES)
                </p>
              )}
            </div>

            {/* Phone input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                M-Pesa Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9 bg-slate-800/50 border-slate-700 focus:border-gold-500"
                />
              </div>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 flex-wrap">
              {(activeTab === "deposit"
                ? [50, 100, 250, 500, 1000]
                : [50, 100, 250]
              ).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                    amount === String(preset)
                      ? "border-gold-500/50 bg-gold-500/10 text-gold-400"
                      : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>

            {/* Info notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-border/50">
              {activeTab === "deposit" ? (
                <Clock className="w-4 h-4 text-gold-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              )}
              <p className="text-xs text-muted-foreground">
                {activeTab === "deposit"
                  ? "Deposits are allocated to the trading pool within 24 hours after confirmation by admin."
                  : "Withdrawals require admin approval and are processed within 48 hours. A 2% processing fee applies."}
              </p>
            </div>

            <Button
              variant={activeTab === "deposit" ? "gold" : "default"}
              className="w-full"
              disabled={isSubmitting || !amount || !phone}
              onClick={
                activeTab === "deposit" ? handleDeposit : handleWithdraw
              }
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : activeTab === "deposit" ? (
                `Deposit ${amountUSD > 0 ? formatUSD(amountUSD) : ""} via M-Pesa`
              ) : (
                `Request Withdrawal ${
                  amountUSD > 0 ? formatUSD(amountUSD) : ""
                }`
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
