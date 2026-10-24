// ─────────────────────────────────────────────────────────────────────────────
// WHO IS THIS NUMBER? — asked of the member's own book, through its node.
//
// Metropol key on the national ID; officers think in phone numbers. So when an
// operator searches by phone, the Interchange asks the node that serves this
// member's book (connected-suite POST /api/node/resolve) for the customers in
// THAT member's entity with that number — never across members, never the
// whole server. A national ID typed directly is asked too, for the name, so
// the operator can see they have the right person before anything is billed.
//
// Same channel as the bureau pull (lib/reports/source): the Registry signs as
// ITSELF (KE/REGISTRY/BUREAU), and the node verifies that key and decides.
// ─────────────────────────────────────────────────────────────────────────────
import { signRequest } from "@/lib/signing";
import { contractHolder } from "@/lib/reports/source";

export type BookMatch = {
  nationalId: string;
  name: string | null;
  phone: string | null;
  accountNo: string | null;
  /** Loans on this member's book, and how many are open. */
  loans: number;
  openLoans: number;
};

export type ResolveOutcome = { ok: true; matches: BookMatch[] } | { ok: false; message: string };

export async function resolveInBook(memberCode: string, query: { msisdn?: string; nationalId?: string }): Promise<ResolveOutcome> {
  const holder = contractHolder();
  if (!holder) return { ok: false, message: "This Registry has no member node configured to look customers up in." };

  const path = "/api/node/resolve";
  const body = JSON.stringify({
    member_code: memberCode,
    ...(query.msisdn ? { msisdn: query.msisdn } : {}),
    ...(query.nationalId ? { national_id: query.nationalId } : {}),
  });
  const headers = signRequest({ method: "POST", path, body, memberCode: holder.callerCode, secretKeyHex: holder.secretKey });
  try {
    const res = await fetch(`${holder.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: String(j.message ?? j.error ?? `The member's node answered ${res.status}.`) };
    const rows = Array.isArray(j.matches) ? (j.matches as Record<string, unknown>[]) : [];
    return {
      ok: true,
      matches: rows
        .map((r) => ({
          nationalId: String(r.national_id ?? ""),
          name: (r.name as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
          accountNo: (r.account_no as string | null) ?? null,
          loans: Number(r.loans ?? 0),
          openLoans: Number(r.open_loans ?? 0),
        }))
        .filter((m) => m.nationalId),
    };
  } catch (e) {
    return { ok: false, message: `The member's book could not be reached: ${e instanceof Error ? e.message : String(e)}` };
  }
}
