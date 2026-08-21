import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, investmentRange } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // User exists in the main platform — create trading profile only
      const existingProfile = await prisma.tradingProfile.findUnique({
        where: { userId: existingUser.id },
      });

      if (existingProfile) {
        return NextResponse.json(
          { error: "You already have a trading account" },
          { status: 409 }
        );
      }

      await prisma.tradingProfile.create({
        data: {
          userId: existingUser.id,
          tradingRole: "INVESTOR",
          kycStatus: "PENDING",
          isApproved: false,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Trading profile created. Pending admin approval.",
      });
    }

    // Create new user + trading profile
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
        phone: phone || null,
        role: "INDIVIDUAL",
        tier: "FREE",
      },
    });

    await prisma.tradingProfile.create({
      data: {
        userId: user.id,
        tradingRole: "INVESTOR",
        kycStatus: "PENDING",
        isApproved: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Application submitted! You'll be notified once approved.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
