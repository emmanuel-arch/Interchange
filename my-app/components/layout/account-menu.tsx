"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  User, Settings, Cpu, Shield, LogOut, ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SessionUser {
  id: string
  email: string | null
  name: string | null
  role: string | null
  tier: string | null
  birgenAiId: string | null
}

function getInitials(user: SessionUser | null): string {
  const source = user?.name?.trim() || user?.email?.trim() || ""
  if (!source) return ""
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return source.slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const NAV_OPTIONS = [
  { label: "Engine Control", href: "/dashboard/engine", icon: Cpu },
  { label: "Risk Fortress", href: "/dashboard/risk", icon: Shield },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function AccountMenu() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (active && data?.authenticated) setUser(data.user as SessionUser)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // Even if the request fails, send them back to the lock.
    }
    router.replace("/")
    router.refresh()
  }

  const initials = getInitials(user)
  const displayName = user?.name?.trim() || user?.email?.trim() || "Operator"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2 transition-all duration-150 hover:border-amber-500/30 hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 font-mono text-[11px] font-semibold text-amber-500">
            {initials || <User className="h-3.5 w-3.5" />}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 font-mono">
        <DropdownMenuLabel className="flex flex-col gap-1 py-2">
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          {user?.email && (
            <span className="truncate text-[11px] font-normal text-muted-foreground">{user.email}</span>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {user?.birgenAiId && (
              <span className="text-[10px] tracking-wider text-amber-500/70">{user.birgenAiId}</span>
            )}
            {user?.role && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase tracking-wider">
                {user.role}
              </Badge>
            )}
            {user?.tier && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase tracking-wider">
                {user.tier}
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {NAV_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.href}
            className="cursor-pointer text-sm"
            onSelect={() => router.push(opt.href)}
          >
            <opt.icon className="h-4 w-4" />
            {opt.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          className={cn("cursor-pointer text-sm")}
          onSelect={(e) => {
            // Keep the menu logic running after it closes.
            e.preventDefault()
            void handleSignOut()
          }}
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
