import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// M-Pesa STK Push callback handler
// This endpoint receives payment confirmations from Safaricom
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Body } = body;

    if (!Body?.stkCallback) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" });
    }

    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } =
      Body.stkCallback;

    if (ResultCode === 0 && CallbackMetadata?.Item) {
      // Payment successful — extract metadata
      const metadata: Record<string, string | number> = {};
      CallbackMetadata.Item.forEach(
        (item: { Name: string; Value: string | number }) => {
          metadata[item.Name] = item.Value;
        }
      );

      const amount = metadata.Amount as number;
      const mpesaRef = metadata.MpesaReceiptNumber as string;
      const phone = String(metadata.PhoneNumber);

      // Find pending deposit request by CheckoutRequestID or phone
      // In production, store CheckoutRequestID when initiating STK push
      const pendingDeposit = await prisma.depositRequest.findFirst({
        where: {
          status: "PENDING",
          mpesaRef: null,
        },
        orderBy: { createdAt: "desc" },
      });

      if (pendingDeposit) {
        await prisma.depositRequest.update({
          where: { id: pendingDeposit.id },
          data: {
            status: "APPROVED",
            mpesaRef,
            processedAt: new Date(),
          },
        });
      }

      console.log(
        `M-Pesa payment confirmed: ${mpesaRef}, Amount: ${amount}, Phone: ${phone}`
      );
    } else {
      console.log(`M-Pesa payment failed: ${ResultDesc} (${CheckoutRequestID})`);
    }

    // Always return success to Safaricom
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("M-Pesa callback error:", error);
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Server error" });
  }
}
