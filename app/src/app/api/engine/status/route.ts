import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import axios from "axios";

const CONTROL_SERVER = process.env.CONTROL_SERVER_URL || "http://45.150.190.19:5000";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await axios.get(`${CONTROL_SERVER}/api/engine/status`, {
      timeout: 5000,
    });
    return NextResponse.json(response.data);
  } catch (error) {
    // If the control server is unreachable, return offline status
    return NextResponse.json({
      isOnline: false,
      lastPing: null,
      currentSession: null,
      openPositions: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      killSwitch: false,
      error: "Control server unreachable",
    });
  }
}
