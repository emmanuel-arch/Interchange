"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CreditCard, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react"
import { generatePayments } from "@/lib/trading-mock-data"

type Filter = "ALL" | "DEPOSIT" | "WITHDRAWAL" | "SUBSCRIPTION"

export default function PaymentsPage() {
  const payments = useMemo(() => generatePayments(30), [])
  const [filter, setFilter] = useState<Filter>("ALL")
  const filtered = filter === "ALL" ? payments : payments.filter(p => p.type === filter)

  const deposits = payments.filter(p => p.type === "DEPOSIT").reduce((s, p) => s + p.amount, 0)
  const withdrawals = payments.filter(p => p.type === "WITHDRAWAL").reduce((s, p) => s + p.amount, 0)
  const subs = payments.filter(p => p.type === "SUBSCRIPTION").reduce((s, p) => s + p.amount, 0)

  const filters: Filter[] = ["ALL", "DEPOSIT", "WITHDRAWAL", "SUBSCRIPTION"]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-amber-500" />
          Payments
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          M-Pesa & manual payments • {payments.length} transactions
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">{payments.length}</div>
          <div className="text-[9px] font-mono text-muted-foreground">TRANSACTIONS</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-green-500" />
            <span className="text-lg font-mono font-bold text-green-500">${deposits.toLocaleString()}</span>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">DEPOSITS</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
            <span className="text-lg font-mono font-bold text-red-500">${withdrawals.toLocaleString()}</span>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">WITHDRAWALS</div>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-lg font-mono font-bold text-amber-500">${subs.toLocaleString()}</span>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">SUBSCRIPTIONS</div>
        </CardContent></Card>
      </div>

      <div className="flex gap-2">
        {filters.map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}
            className={`text-xs font-mono ${filter === f ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}`}>
            {f}
          </Button>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-normal">Date</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Type</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Method</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-normal">User</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-normal">Amount</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Reference</th>
                  <th className="text-center py-2.5 px-3 text-muted-foreground font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-3 text-foreground">{new Date(p.timestamp).toLocaleDateString()}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${
                        p.type === "DEPOSIT" ? "text-green-400 border-green-400/30" :
                        p.type === "WITHDRAWAL" ? "text-red-400 border-red-400/30" :
                        "text-amber-400 border-amber-400/30"
                      }`}>
                        {p.type}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{p.method}</td>
                    <td className="py-2 px-3 text-foreground">{p.userId}</td>
                    <td className={`py-2 px-3 text-right font-medium ${
                      p.type === "DEPOSIT" ? "text-green-500" :
                      p.type === "WITHDRAWAL" ? "text-red-500" :
                      "text-amber-500"
                    }`}>
                      {p.type === "WITHDRAWAL" ? "-" : "+"}${p.amount.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{p.mpesaReceiptNumber || p.reference || '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={`text-[9px] ${
                        p.status === "COMPLETED" ? "text-green-400 border-green-400/30" :
                        p.status === "PENDING" ? "text-amber-400 border-amber-400/30" :
                        "text-red-400 border-red-400/30"
                      }`}>
                        {p.status}
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
