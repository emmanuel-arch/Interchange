"use client"

import { useState } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { AccountMenu } from "@/components/layout/account-menu"
import { TradingScreenLock } from "@/components/screensaver/trading-screenlock"
import { cn } from "@/lib/utils"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          "transition-all duration-300",
          collapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-white/5 bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <AccountMenu />
        </header>
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <TradingScreenLock mode="idle" />
    </div>
  )
}
