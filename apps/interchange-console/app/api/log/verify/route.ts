// GET /api/log/verify — re-derive the whole chain.
//
// Public on purpose. A tamper-evident log that only its operator can check is
// not evidence, it is an assertion. Any member should be able to ask the
// Registry to prove its own log is intact, and get an answer that does not
// depend on trusting the answer.
//
// It exposes no borrower data — only whether the hashes still line up.
import { NextResponse } from "next/server";
import { verifyChain } from "@/lib/messagelog";

export async function GET() {
  const report = await verifyChain();
  return NextResponse.json(
    {
      ok: report.ok,
      checked: report.checked,
      broken_at: report.brokenAt?.toString() ?? null,
      reason: report.reason,
    },
    { status: report.ok ? 200 : 409 },
  );
}
