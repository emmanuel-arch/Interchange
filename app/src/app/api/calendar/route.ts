import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Economic calendar data — in production, this would come from a third-party API
// or be synced from the Windows engine via the Linux VPS
const calendarEvents = [
  {
    id: "1",
    date: "2026-04-04",
    time: "12:30 UTC",
    event: "Non-Farm Payrolls",
    currency: "USD",
    impact: "high" as const,
    forecast: "180K",
    previous: "151K",
    isBlocked: true,
  },
  {
    id: "2",
    date: "2026-04-10",
    time: "12:30 UTC",
    event: "CPI (YoY)",
    currency: "USD",
    impact: "high" as const,
    forecast: "3.1%",
    previous: "3.2%",
    isBlocked: true,
  },
  {
    id: "3",
    date: "2026-04-16",
    time: "18:00 UTC",
    event: "FOMC Rate Decision",
    currency: "USD",
    impact: "high" as const,
    forecast: "5.25%",
    previous: "5.25%",
    isBlocked: true,
  },
  {
    id: "4",
    date: "2026-04-07",
    time: "14:00 UTC",
    event: "ISM Services PMI",
    currency: "USD",
    impact: "medium" as const,
    forecast: "52.5",
    previous: "53.8",
    isBlocked: false,
  },
  {
    id: "5",
    date: "2026-04-08",
    time: "12:30 UTC",
    event: "Trade Balance",
    currency: "USD",
    impact: "medium" as const,
    forecast: "-65.0B",
    previous: "-68.3B",
    isBlocked: false,
  },
  {
    id: "6",
    date: "2026-04-11",
    time: "12:30 UTC",
    event: "PPI (MoM)",
    currency: "USD",
    impact: "medium" as const,
    forecast: "0.3%",
    previous: "0.6%",
    isBlocked: false,
  },
  {
    id: "7",
    date: "2026-04-15",
    time: "12:30 UTC",
    event: "Retail Sales (MoM)",
    currency: "USD",
    impact: "high" as const,
    forecast: "0.4%",
    previous: "0.6%",
    isBlocked: true,
  },
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(calendarEvents);
}
