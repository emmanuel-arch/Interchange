"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Settings,
  Users,
  BarChart3,
  Power,
  Send,
  UserPlus,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  variant: "admin" | "investor";
}

const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/trades", label: "Trade Monitor", icon: TrendingUp },
  { href: "/admin/engine", label: "Engine Status", icon: Activity },
  { href: "/admin/risk", label: "Risk Dashboard", icon: BarChart3 },
  { href: "/admin/config", label: "Engine Config", icon: Settings },
  { href: "/admin/investors", label: "Investors", icon: Users },
  { href: "/admin/onboarding", label: "Onboarding Queue", icon: UserPlus },
  { href: "/admin/telegram", label: "Telegram", icon: Send },
  { href: "/admin/calendar", label: "Economic Calendar", icon: Calendar },
  { href: "/admin/kill-switch", label: "Kill Switch", icon: Power },
];

const investorLinks = [
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/dashboard/trades", label: "Trade History", icon: TrendingUp },
  { href: "/dashboard/live", label: "Live Trades", icon: Activity },
  { href: "/dashboard/performance", label: "Performance", icon: BarChart3 },
  { href: "/dashboard/deposits", label: "Deposits", icon: UserPlus },
  { href: "/dashboard/statements", label: "Statements", icon: Calendar },
];

export default function Sidebar({ variant }: SidebarProps) {
  const pathname = usePathname();
  const links = variant === "admin" ? adminLinks : investorLinks;

  return (
    <aside className="hidden w-[200px] flex-col md:flex">
      <nav className="grid items-start gap-2">
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== `/${variant === "admin" ? "admin" : "dashboard"}` &&
              pathname.startsWith(link.href));

          return (
            <Link key={link.href} href={link.href}>
              <span
                className={cn(
                  "group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  isActive ? "bg-accent" : "transparent"
                )}
              >
                <link.icon className="mr-2 h-4 w-4" />
                <span>{link.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
