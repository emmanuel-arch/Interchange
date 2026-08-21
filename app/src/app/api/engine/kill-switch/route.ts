import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import axios from "axios";

const CONTROL_SERVER = process.env.CONTROL_SERVER_URL || "http://45.150.190.19:5000";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.tradingRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden — SuperAdmin only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { active } = body;

    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request: active must be a boolean" },
        { status: 400 }
      );
    }

    // Forward to Linux VPS control server
    const response = await axios.post(
      `${CONTROL_SERVER}/api/engine/kill-switch`,
      { active },
      { timeout: 10000 }
    );

    return NextResponse.json({
      success: true,
      killSwitch: active,
      message: active
        ? "Kill switch activated — all positions will be closed"
        : "Kill switch deactivated — engine will resume trading",
      data: response.data,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to toggle kill switch" },
      { status: 502 }
    );
  }
}
