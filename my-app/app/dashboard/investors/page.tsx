"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, DollarSign, TrendingUp, UserCheck } from "lucide-react"
import { generateInvestors } from "@/lib/trading-mock-data"

export default function InvestorsPage() {
  const investors = useMemo(() => generateInvestors(), [])
  const totalAum = investors.reduce((s, inv) => s + inv.balance, 0)
  const totalProfit = investors.reduce((s, inv) => s + inv.profitTotal, 0)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <Users className="w-7 h-7 text-amber-500" />
          Investors
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {investors.length} accounts • AUM: ${totalAum.toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">{investors.length}</div>
          <div className="text-[9px] font-mono text-muted-foreground">INVESTORS</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">${totalAum.toLocaleString()}</div>
          <div className="text-[9px] font-mono text-muted-foreground">TOTAL AUM</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-mono font-bold text-green-500">+${totalProfit.toLocaleString()}</div>
          <div className="text-[9px] font-mono text-muted-foreground">TOTAL PROFIT</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-mono font-bold text-amber-500">{investors.filter(i => i.subscriptionStatus === "ACTIVE").length}</div>
          <div className="text-[9px] font-mono text-muted-foreground">ACTIVE SUBS</div>
        </CardContent></Card>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-normal">Name</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Role</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Deposited</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Balance</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Profit</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Profit %</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-3">
                      <div className="text-foreground">{inv.name}</div>
                      <div className="text-[10px] text-muted-foreground">{inv.email}</div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${inv.role === "ADMIN" ? "text-amber-400 border-amber-400/30" : "text-blue-400 border-blue-400/30"}`}>
                        {inv.role}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-foreground">${inv.depositTotal.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-foreground">${inv.balance.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-green-500">+${inv.profitTotal.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-green-500">+{inv.profitPct}%</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${inv.subscriptionStatus === "ACTIVE" ? "text-green-400 border-green-400/30" : "text-amber-400 border-amber-400/30"}`}>
                        {inv.subscriptionStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
