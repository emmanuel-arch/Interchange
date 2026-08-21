"use client";

import PortfolioOverview from "@/components/dashboard/PortfolioOverview";
import LiveTrades from "@/components/dashboard/LiveTrades";
import TradeHistory from "@/components/dashboard/TradeHistory";
import ProfitTracker from "@/components/dashboard/ProfitTracker";
import DepositWithdrawal from "@/components/dashboard/DepositWithdrawal";

export default function InvestorDashboard() {
  return (
    <div className="grid items-start gap-8">
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <h1 className="font-heading text-3xl md:text-4xl">Investor Dashboard</h1>
          <p className="text-lg text-muted-foreground">
            Track your portfolio, view trades, and manage deposits
          </p>
        </div>
      </div>

      {/* Portfolio summary cards */}
      <PortfolioOverview />

      {/* Two-column layout: live trades + profit tracker */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <LiveTrades />
        <ProfitTracker />
      </div>

      {/* Trade history table */}
      <TradeHistory />

      {/* Deposit / Withdrawal section */}
      <DepositWithdrawal />
    </div>
  );
}
