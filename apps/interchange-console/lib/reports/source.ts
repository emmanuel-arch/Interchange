// ─────────────────────────────────────────────────────────────────────────────
// WHERE BUREAU DATA COMES FROM — and why the Registry never holds a bureau key.
//
// ── THE ARCHITECTURAL POINT ──────────────────────────────────────────────────
// A Metropol contract belongs to a LENDER, not to the Interchange. Micromart
// signed it, Micromart's public IP is whitelisted at Metropol's edge, and
// Micromart's keys sit in Micromart's vault. So the Interchange does not call
// the bureau: it asks the member who holds the contract to make the call, over
// the same signed member-to-member envelope every other exchange uses.
//
// That is what makes bureau resale a CONTRIBUTION rather than a resale licence.
// Micromart contributes bureau reach the way Axe contributes a book; the
// Registry brokers, meters and logs it, and the money follows the same path.
// It also means the Registry cannot leak a bureau credential it never had.
//
// ── THE ONE PLACE AN IDENTIFIER LEGITIMATELY CROSSES ─────────────────────────
// Everywhere else in this system, identity is destroyed at the edge. A bureau
// pull is the exception, and it has to be: Metropol key their entire database on
// the national ID, so a report about a person cannot be bought with a token that
// no bureau has ever seen.
//
// This is not a hole in the tokenisation boundary; it is a different service
// with a different lawful basis — the member is buying a bureau report about
// their OWN customer, on that customer's documented consent (`bureau.pull`),
// exactly as they would if they held the contract themselves. The rules that
// keep it honest:
//
//   1. The identifier is accepted ONLY on the bureau path, never on exposure.
//   2. The Registry derives the subject token from it and REQUIRES that token to
//      match the consent being presented — so one borrower's consent cannot be
//      used to buy another borrower's file. This check is only possible because
//      the Registry holds the ecosystem key, and it is the strongest anti-abuse
//      control in the product.
//   3. The identifier is never persisted and never logged. The message log
//      records the subject token and a digest, as it does for every other call.
//   4. The stored artefact is keyed by subject token, so Axe can retrieve a
//      report Micromart paid for, under the same token, when consent allows —
//      without either party exchanging a name.
// ─────────────────────────────────────────────────────────────────────────────
import { signRequest } from "@/lib/signing";

export type BureauPull = {
  reportType: number;
  ok: boolean;
  payload: Record<string, unknown> | null;
  apiCode: string | null;
  message: string | null;
  ms: number;
};

export type BureauAnswer = {
  /** Which member actually called the bureau. */
  contractHolder: string;
  pulls: BureauPull[];
  /** Billed pulls — refusals and cache hits are not billed. */
  billed: number;
  cached: boolean;
};

export class BureauUnavailable extends Error {
  constructor(
    message: string,
    readonly reason: "not-configured" | "unreachable" | "refused",
  ) {
    super(message);
    this.name = "BureauUnavailable";
  }
}

/**
 * The member whose Metropol contract the ecosystem borrows, and where its node
 * is — plus the identity the REGISTRY signs as when it calls them.
 *
 * The Registry signs as ITSELF, never as the contract holder. Signing as
 * Micromart would mean the Registry holding a member's private key, which is
 * the one thing the whole signing design exists to avoid: a member's key is
 * what proves a member said something, and a broker that can forge it can
 * forge anything. So the node verifies a REGISTRY key it has been given, and
 * the request names which member the report is for.
 */
export function contractHolder(): {
  code: string;
  url: string;
  callerCode: string;
  secretKey: string;
} | null {
  const code = process.env.INTERCHANGE_BUREAU_MEMBER?.trim();
  const url = process.env.INTERCHANGE_BUREAU_NODE_URL?.trim();
  const secretKey = process.env.INTERCHANGE_BUREAU_NODE_KEY?.trim();
  const callerCode = process.env.INTERCHANGE_BUREAU_CALLER?.trim() || "KE/REGISTRY/BUREAU";
  if (!code || !url || !secretKey) return null;
  return { code, url: url.replace(/\/+$/, ""), callerCode, secretKey };
}

/**
 * Ask the contract holder's node for a set of Metropol reports.
 *
 * The Registry signs AS ITSELF here — the request is Registry → member node, and
 * the node decides whether the Registry is allowed to spend its bureau budget.
 * A member node that does not want to sell bureau reach simply refuses, and the
 * Interchange reports that rather than routing around it.
 */
export async function pullFromContractHolder(opts: {
  identityNumber: string;
  identityType?: string;
  reportTypes: number[];
  loanAmount?: number;
  reportReason?: number;
  timeoutMs?: number;
  /** The member this report is for — who gets billed, and who the node audits. */
  onBehalfOf: string;
}): Promise<BureauAnswer> {
  const holder = contractHolder();
  if (!holder) {
    throw new BureauUnavailable(
      "No bureau contract holder is configured. Set INTERCHANGE_BUREAU_MEMBER, _NODE_URL and _NODE_KEY.",
      "not-configured",
    );
  }

  const path = "/api/node/bureau";
  const body = JSON.stringify({
    identity_number: opts.identityNumber,
    identity_type: opts.identityType ?? "001",
    report_types: opts.reportTypes,
    loan_amount: opts.loanAmount ?? 10_000,
    report_reason: opts.reportReason ?? 1,
    on_behalf_of: opts.onBehalfOf,
  });
  const headers = signRequest({
    method: "POST",
    path,
    body,
    memberCode: holder.callerCode,
    secretKeyHex: holder.secretKey,
  });

  let res: Response;
  try {
    res = await fetch(`${holder.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      // A bureau pull is several serial calls to a third party; it gets a real
      // budget rather than the 250ms a node-to-node exposure query gets.
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
  } catch (e) {
    throw new BureauUnavailable(
      `Could not reach ${holder.code}'s node at ${holder.url}. ${e instanceof Error ? e.message : String(e)}`,
      "unreachable",
    );
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new BureauUnavailable(
      String(json.message ?? json.error ?? `The contract holder refused (HTTP ${res.status}).`),
      "refused",
    );
  }

  const pulls = Array.isArray(json.pulls) ? (json.pulls as Record<string, unknown>[]) : [];
  return {
    contractHolder: holder.code,
    pulls: pulls.map((p) => ({
      reportType: Number(p.report_type),
      ok: p.ok === true,
      payload: (p.payload as Record<string, unknown> | null) ?? null,
      apiCode: (p.api_code as string | null) ?? null,
      message: (p.message as string | null) ?? null,
      ms: Number(p.ms ?? 0),
    })),
    billed: Number(json.billed ?? 0),
    cached: json.cached === true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLAY — a captured bureau answer, served from disk.
//
// Demos and development must not depend on spending money at a bureau, and a
// live pull is the one part of this system that cannot be exercised freely. So a
// previously captured answer can be replayed.
//
// Replay is FENCED and LABELLED. It requires an explicit env var, it refuses in
// production, and every report it produces carries a REPLAY stamp on the page —
// because a bureau report that silently came from a file is indistinguishable
// from fraud, and the KYC simulator elsewhere in this estate is a standing
// reminder of how that ends.
// ─────────────────────────────────────────────────────────────────────────────
export function replayDir(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.INTERCHANGE_BUREAU_REPLAY_DIR?.trim() || null;
}

export async function pullFromReplay(reportTypes: number[]): Promise<BureauAnswer> {
  const dir = replayDir();
  if (!dir) throw new BureauUnavailable("Replay is not enabled.", "not-configured");

  const { readdirSync, readFileSync } = await import("fs");
  const { join } = await import("path");

  const pulls: BureauPull[] = [];
  // The replay directory is an operator-set path outside the app. Marked so the
  // bundler does not trace the whole project into every server function.
  for (const f of readdirSync(/*turbopackIgnore: true*/ dir)) {
    const m = f.match(/report-(\d+)(?:\.wire)?\.json$/);
    if (!m) continue;
    const type = Number(m[1]);
    if (!reportTypes.includes(type)) continue;
    const parsed = JSON.parse(readFileSync(join(/*turbopackIgnore: true*/ dir, f), "utf8")) as Record<string, unknown>;
    const payload = parsed.json && typeof parsed.json === "object" ? (parsed.json as Record<string, unknown>) : parsed;
    pulls.push({ reportType: type, ok: true, payload, apiCode: null, message: null, ms: 0 });
  }

  return { contractHolder: "replay", pulls: pulls.sort((a, b) => a.reportType - b.reportType), billed: 0, cached: true };
}
