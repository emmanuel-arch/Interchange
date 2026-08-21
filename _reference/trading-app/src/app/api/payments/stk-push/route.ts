import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY!;
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "174379";
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "";
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
    const { amount, phone, type } = body;

    if (!amount || !phone) {
      return NextResponse.json(
        { error: "Amount and phone number are required" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount < 1) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Sanitize phone — must be 254XXXXXXXXX
    const sanitizedPhone = phone.replace(/\D/g, "");
    if (!/^254\d{9}$/.test(sanitizedPhone)) {
      return NextResponse.json(
        { error: "Invalid phone number format. Use 254XXXXXXXXX" },
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

    const stkPayload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: sanitizedPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: sanitizedPhone,
      CallBackURL: MPESA_CALLBACK_URL || `${process.env.NEXTAUTH_URL}/api/payments/callback`,
      AccountReference: `GoldStrike-${type || "deposit"}-${session.user.email}`,
      TransactionDesc: `GoldStrike Trading ${type || "deposit"}`,
    };

    const stkResponse = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const stkData = await stkResponse.json();

    if (stkData.ResponseCode === "0") {
      return NextResponse.json({
        success: true,
        checkoutRequestId: stkData.CheckoutRequestID,
        merchantRequestId: stkData.MerchantRequestID,
        message: "STK push sent. Check your phone.",
      });
    } else {
      return NextResponse.json(
        {
          error: "STK push failed",
          details: stkData.errorMessage || stkData.ResponseDescription,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("STK Push error:", error);
    return NextResponse.json(
      { error: "Payment processing failed" },
      { status: 500 }
    );
  }
}
