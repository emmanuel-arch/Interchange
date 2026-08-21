import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, investmentRange } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Check for existing entry
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You're already on the waitlist!" },
        { status: 409 }
      );
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        name,
        email,
        phone: phone || null,
        investmentRange: investmentRange || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "You've been added to the waitlist!",
      id: entry.id,
    });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Admin-only endpoint for viewing waitlist
  try {
    const entries = await prisma.waitlistEntry.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch waitlist" },
      { status: 500 }
    );
  }
}
