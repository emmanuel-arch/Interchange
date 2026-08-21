"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Activity, BarChart3, Shield, Server, Terminal, History, FlaskConical,
  Send, AlertTriangle, Users, CreditCard, Settings, ChevronLeft,
  ChevronRight, Zap, Radio, Database, Calendar, LayoutDashboard,
  Power, Eye, Bot, Cpu
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  badgeColor?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navigation: NavGroup[] = [
  {
    label: "COMMAND CENTER",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Live Trade Monitor", href: "/dashboard/live", icon: Radio, badge: "LIVE", badgeColor: "bg-green-500" },
      { label: "Engine Control", href: "/dashboard/engine", icon: Cpu },
    ],
  },
  {
    label: "RISK & MANAGEMENT",
    items: [
      { label: "Risk Fortress", href: "/dashboard/risk", icon: Shield },
      { label: "Trade History", href: "/dashboard/trades", icon: History },
      { label: "Backtesting", href: "/dashboard/backtest", icon: FlaskConical },
    ],
  },
  {
    label: "INFRASTRUCTURE",
    items: [
      { label: "System Health", href: "/dashboard/infrastructure", icon: Server },
      { label: "Network Monitor", href: "/dashboard/network", icon: Activity },
      { label: "Database Explorer", href: "/dashboard/database", icon: Database },
    ],
  },
  {
    label: "COMMUNICATIONS",
    items: [
      { label: "Alerts Center", href: "/dashboard/alerts", icon: AlertTriangle },
      { label: "Telegram Bot", href: "/dashboard/telegram", icon: Bot },
      { label: "Schedules", href: "/dashboard/schedules", icon: Calendar },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { label: "Investors", href: "/dashboard/investors", icon: Users },
      { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-transparent transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 shrink-0">
        <Image
          src="/BirgenAI-logo.png"
          alt="BirgenAI"
          width={collapsed ? 32 : 140}
          height={32}
          className="object-contain shrink-0"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navigation.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-mono font-semibold text-muted-foreground tracking-widest">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-mono transition-all duration-150 group relative",
                      isActive
                        ? "bg-amber-500/10 text-amber-500"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-500 rounded-r" />
                    )}
                    <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-amber-500" : "text-muted-foreground group-hover:text-foreground")} />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className={cn("ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white", item.badgeColor || "bg-muted")}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  )
}
