import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [openTrades, recentClosed] = await Promise.all([
      prisma.trade.findMany({
        where: { status: "OPEN" },
        orderBy: { openedAt: "desc" },
      }),
      prisma.trade.findMany({
        where: { status: "CLOSED" },
        orderBy: { closedAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      open: openTrades,
      closed: recentClosed,
    });
  } catch (error) {
    console.error("Failed to fetch trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 }
    );
  }
}
