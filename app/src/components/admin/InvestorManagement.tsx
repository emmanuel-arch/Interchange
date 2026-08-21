"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Check, X, Eye } from "lucide-react";
import { formatUSD, formatPct } from "@/lib/utils";

const mockInvestors = [
  { id: "1", name: "Alice Wanjiku", email: "alice@example.com", capital: 5000, currentValue: 7340, returnPct: 46.8, status: "APPROVED" },
  { id: "2", name: "James Ochieng", email: "james@example.com", capital: 10000, currentValue: 14250, returnPct: 42.5, status: "APPROVED" },
  { id: "3", name: "Mary Njeri", email: "mary@example.com", capital: 2500, currentValue: 3380, returnPct: 35.2, status: "APPROVED" },
  { id: "4", name: "Peter Kamau", email: "peter@example.com", capital: 8000, currentValue: 0, returnPct: 0, status: "PENDING" },
];

export default function InvestorManagement() {
  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-gold-400" />
            Investor Accounts
          </CardTitle>
          <Badge variant="gold">{mockInvestors.length} investors</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-3 px-2 font-medium">Investor</th>
                <th className="text-right py-3 px-2 font-medium">Capital</th>
                <th className="text-right py-3 px-2 font-medium">Current</th>
                <th className="text-right py-3 px-2 font-medium">Return</th>
                <th className="text-center py-3 px-2 font-medium">Status</th>
                <th className="text-right py-3 px-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockInvestors.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-border/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3 px-2">
                    <div>
                      <p className="font-medium text-foreground">{inv.name}</p>
                      <p className="text-xs text-muted-foreground">{inv.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-foreground">
                    {formatUSD(inv.capital)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-foreground">
                    {inv.currentValue > 0 ? formatUSD(inv.currentValue) : "—"}
                  </td>
                  <td
                    className={`py-3 px-2 text-right tabular-nums font-medium ${
                      inv.returnPct > 0 ? "text-emerald-400" : "text-foreground"
                    }`}
                  >
                    {inv.returnPct > 0 ? formatPct(inv.returnPct) : "—"}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Badge
                      variant={
                        inv.status === "APPROVED" ? "online" : "pending"
                      }
                    >
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {inv.status === "PENDING" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
