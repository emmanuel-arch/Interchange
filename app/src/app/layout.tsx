import React from "react";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import AuthProvider from "@/components/AuthProvider";
import { Toaster } from "sonner";
import QueryProvider from "@/components/QueryProvider";

const fontSans = FontSans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const fontHeading = localFont({
  src: "../fonts/CalSans-SemiBold.woff2",
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: {
    default: "GoldStrike Trading | AI-Powered Gold Trading",
    template: "%s | GoldStrike Trading",
  },
  description:
    "AI-powered gold trading platform with proven returns. Transparent P&L, MT5 verified, XAUUSD algorithmic trading by BirgenAI.",
  keywords: ["gold trading", "XAUUSD", "algorithmic trading", "AI trading", "forex", "BirgenAI"],
  authors: [{ name: "BirgenAI" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://trade.birgenai.com",
    siteName: "GoldStrike Trading",
    title: "GoldStrike Trading | AI-Powered Gold Trading",
    description: "AI-powered gold trading platform with proven returns.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
          fontHeading.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          <AuthProvider>
            <QueryProvider>
              {children}
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                  },
                }}
              />
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
