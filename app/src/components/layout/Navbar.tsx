"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TrendingUp,
  Shield,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/#performance", label: "Performance" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#waitlist", label: "Join Waitlist" },
];

const investorLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/trades", label: "Trades", icon: TrendingUp },
];

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";
  const isAuthenticated = !!session?.user;

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="container flex h-16 items-center justify-between py-4">
        {/* Left side: Logo + Nav */}
        <div className="flex gap-6 md:gap-10">
          <Link href="/" className="hidden items-center space-x-2 md:flex">
            <TrendingUp className="h-6 w-6 text-gold-500" />
            <span className="hidden font-heading text-lg font-bold sm:inline-block">
              GoldStrike
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden gap-6 md:flex">
            {!isAuthenticated &&
              publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm",
                    pathname === link.href
                      ? "text-foreground"
                      : "text-foreground/60"
                  )}
                >
                  {link.label}
                </Link>
              ))}

            {isAuthenticated &&
              investorLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm",
                    pathname === link.href || pathname.startsWith(link.href + "/")
                      ? "text-foreground"
                      : "text-foreground/60"
                  )}
                >
                  {link.label}
                </Link>
              ))}

            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm",
                  pathname.startsWith("/admin")
                    ? "text-foreground"
                    : "text-foreground/60"
                )}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="flex items-center space-x-2 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <TrendingUp className="h-5 w-5 text-gold-500" />
            )}
            <span className="font-bold">Menu</span>
          </button>
        </div>

        {/* Right side: Theme toggle + Auth */}
        <div className="flex items-center gap-2">
          <ModeToggle />

          {!isAuthenticated ? (
            <div className="hidden md:flex items-center gap-2">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/#waitlist">
                <Button variant="gold" size="sm">
                  Get Started
                </Button>
              </Link>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden md:flex">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gold-500/20 text-gold-500 text-xs font-bold">
                    {session.user.name?.[0] || session.user.email?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {session.user.name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <User className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Console
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-50 grid h-[calc(100vh-4rem)] grid-flow-row auto-rows-max overflow-auto p-6 pb-32 shadow-md animate-in slide-in-from-bottom-80 md:hidden">
          <div className="relative z-20 grid gap-6 rounded-md bg-popover p-4 text-popover-foreground shadow-md">
            <nav className="grid grid-flow-row auto-rows-max text-sm">
              {!isAuthenticated &&
                publicLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              {isAuthenticated &&
                investorLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                  onClick={() => setMobileOpen(false)}
                >
                  Admin Console
                </Link>
              )}
              {!isAuthenticated && (
                <Link
                  href="/auth/login"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium text-gold-500 hover:underline"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign In
                </Link>
              )}
              {isAuthenticated && (
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    signOut({ callbackUrl: "/" });
                  }}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium text-red-600 hover:underline"
                >
                  Sign Out
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
