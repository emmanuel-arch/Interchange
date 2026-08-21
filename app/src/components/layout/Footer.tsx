import * as React from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

export default function Footer({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer className={cn(className)}>
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <TrendingUp className="h-5 w-5 text-gold-500" />
          <p className="text-center text-sm leading-loose md:text-left">
            <span className="font-heading font-bold">GoldStrike</span> by{" "}
            <a
              href="https://birgenai.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              BirgenAI
            </a>
            . AI-powered gold trading.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-center text-xs text-muted-foreground">
            MT5 Verified &middot; Exness Regulated
          </p>
          <ModeToggle />
        </div>
      </div>
    </footer>
  );
}
