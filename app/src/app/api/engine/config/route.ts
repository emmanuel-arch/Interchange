import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import axios from "axios";

const CONTROL_SERVER = process.env.CONTROL_SERVER_URL || "http://45.150.190.19:5000";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.tradingRole || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const response = await axios.get(`${CONTROL_SERVER}/api/engine/config`, {
      timeout: 5000,
    });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch engine config" },
      { status: 502 }
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

    const response = await axios.put(
      `${CONTROL_SERVER}/api/engine/config`,
      body,
      { timeout: 5000 }
    );

    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json(
      { error: "Failed to update engine config" },
      { status: 502 }
    );
  }
}
