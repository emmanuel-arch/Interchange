import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY!;
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "174379";
const MPESA_ENV = process.env.MPESA_ENV || "sandbox";

const baseUrl =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

async function getMpesaToken(): Promise<string> {
  const auth = Buffer.from(
    `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  if (!response.ok) throw new Error("Failed to get M-Pesa token");
  const data = await response.json();
  return data.access_token;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { checkoutRequestId } = body;

    if (!checkoutRequestId) {
      return NextResponse.json(
        { error: "checkoutRequestId is required" },
        { status: 400 }
      );
    }

    const token = await getMpesaToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14);
    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const queryPayload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const queryResponse = await fetch(
      `${baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queryPayload),
      }
    );

    const queryData = await queryResponse.json();

    return NextResponse.json({
      resultCode: queryData.ResultCode,
      resultDesc: queryData.ResultDesc,
      isComplete: queryData.ResultCode === "0",
      isPending: queryData.ResultCode === undefined,
    });
  } catch (error) {
    console.error("Payment status check error:", error);
    return NextResponse.json(
      { error: "Failed to check payment status" },
      { status: 500 }
    );
  }
}
