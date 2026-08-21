import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.tradingRole || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const investors = await prisma.investorAccount.findMany({
      include: {
        profile: {
          select: {
            id: true,
            userId: true,
            kycStatus: true,
            isApproved: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(investors);
  } catch (error) {
    console.error("Failed to fetch investors:", error);
    return NextResponse.json(
      { error: "Failed to fetch investors" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.tradingRole || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { profileId, action } = body;

    if (!profileId || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const profile = await prisma.tradingProfile.update({
      where: { id: profileId },
      data: {
        isApproved: action === "approve",
        kycStatus: action === "approve" ? "APPROVED" : "REJECTED",
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("Failed to update investor:", error);
    return NextResponse.json(
      { error: "Failed to update investor" },
      { status: 500 }
    );
  }
}
