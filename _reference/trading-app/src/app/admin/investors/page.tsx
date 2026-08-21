"use client";

import InvestorManagement from "@/components/admin/InvestorManagement";

export default function AdminInvestorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Investor Management</h1>
        <p className="text-muted-foreground text-sm">
          View accounts, manage allocations, approve withdrawals
        </p>
      </div>
      <InvestorManagement />
    </div>
  );
}
