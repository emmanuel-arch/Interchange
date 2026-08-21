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
    const performance = await prisma.monthlyPerformance.findMany({
      where: { isPublic: true },
      orderBy: { month: "asc" },
    });

    return NextResponse.json(performance);
  } catch (error) {
    console.error("Failed to fetch performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance data" },
      { status: 500 }
    );
  }
}
