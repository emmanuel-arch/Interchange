// ─────────────────────────────────────────────────────────────────────────────
// WHO WAS ON THE OTHER SIDE OF THE ROW.
//
// Safaricom writes the counterparty into the Details column in a handful of
// fixed shapes. Reading them properly is what separates "KES 37,367 to Mular
// Credit Limited Acc." — a merchant string that happens to contain a company
// name — from "shortcode 4145907, account 7981717, a CBK-licensed digital
// credit provider, same account referenced 85 times across six months".
//
// The second one is a credit relationship with an account number. The first is
// a row of text. Everything downstream depends on getting the counterparty out
// as STRUCTURE rather than leaving it as prose.
//
// Shapes handled, all observed on real statements:
//
//   Pay Bill to 4147425 - PHILMED HQ Acc. CUS091796
//   Pay Bill Online Fuliza M-Pesa to 4191500 - ONFON MOBILE LIMITED 2 Acc. 24164374
//   Merchant Payment Fuliza M-Pesa to 6554428 - JOEL NYARIBO
//   Business Payment from 501901 - KCB 1 via API. Original conversation ID is …
//   Customer Transfer Fuliza MPesa to - 0113***991 Millicent Washindu
//   Funds received from - 254725***066 MOSES AHOLO
//   OD Loan Repayment to 232323 - M-PESA Overdraw
//   Small Business Withdrawal from Business Account to MPESA Account by - 2547…
// ─────────────────────────────────────────────────────────────────────────────

export type CounterpartyKind = "business" | "person" | "self" | "system" | "unknown";

export type Counterparty = {
  kind: CounterpartyKind;
  /** Paybill, till or B2C shortcode, when the row carried one. */
  code: string | null;
  /** The name as the statement wrote it, tidied of trailing noise only. */
  name: string | null;
  /** The "Acc." reference — a loan account, a meter, a customer number. */
  accountRef: string | null;
  /** Masked MSISDN for a person-to-person row. */
  msisdn: string | null;
};

const EMPTY: Counterparty = { kind: "unknown", code: null, name: null, accountRef: null, msisdn: null };

/** Trailing tokens that are part of the row, not part of the name. */
function tidyName(raw: string): string {
  return raw
    .replace(/\bvia API\b.*$/i, "")
    .replace(/\bOrig(?:i)?nal conversation ID is\b.*$/i, "")
    .replace(/\bCompleted\b.*$/i, "")
    .replace(/\bAcc\.?\b.*$/i, "")
    .replace(/\s*[-–,.]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const ACC = /\bAcc\.?\s*([A-Za-z0-9][A-Za-z0-9._/-]{0,30})/i;
const MSISDN = /\b((?:254|0)\d{2,3}\*{2,}\d{2,4})\b/;

/**
 * Pull the counterparty out of a Details string.
 *
 * Order matters: the shortcode forms are tested before the person forms,
 * because "to - 254724***722 Maurine ongora" and "to 6554428 - JOEL NYARIBO"
 * differ only by where the dash sits.
 */
export function readCounterparty(details: string): Counterparty {
  const d = String(details ?? "").replace(/\s+/g, " ").trim();
  if (!d) return EMPTY;

  const accMatch = d.match(ACC);
  const accountRef = accMatch ? accMatch[1].replace(/[.,]+$/, "") : null;

  // ── Business with a shortcode: "… to|from <code> - <NAME>" ────────────────
  const biz = d.match(/\b(?:to|from)\s+(\d{4,9})\s*-\s*([^]{1,90}?)(?=\s*(?:Acc\.|Completed|via API|Orig|$))/i);
  if (biz) {
    const name = tidyName(biz[2]);
    if (name) return { kind: "business", code: biz[1], name, accountRef, msisdn: null };
  }

  // ── Business with the code fused to the name, no dash. Safaricom's own
  //    service rows do this: "to 826915Safaricom Offers by".
  const fused = d.match(/\bto\s+(\d{5,9})([A-Za-z][^]{1,60}?)(?=\s*(?:by|Acc\.|Completed|$))/i);
  if (fused) {
    const name = tidyName(fused[2]);
    if (name) return { kind: "business", code: fused[1], name, accountRef, msisdn: null };
  }

  // ── Person: "to - 0113***991 Millicent Washindu" / "from - 2547…  NAME" ───
  const person = d.match(/\b(?:to|from|by)\s*-\s*((?:254|0)\d{2,3}\*{2,}\d{2,4})\s+([^]{1,60}?)(?=\s*(?:Acc\.|Completed|$))/i);
  if (person) {
    const name = tidyName(person[2]);
    // The holder withdrawing from their own till to their own wallet is not a
    // counterparty at all — counting it as income would double-count the sale.
    const self = /\bSmall Business (?:Withdrawal|Deposit)\b/i.test(d) || /\bBusiness Account to MPESA Account\b/i.test(d);
    return { kind: self ? "self" : "person", code: null, name: name || null, accountRef, msisdn: person[1] };
  }

  // ── A masked number with no dash structure. Still a person. ───────────────
  const bare = d.match(MSISDN);
  if (bare && /\b(?:received|transfer|send|paid|by)\b/i.test(d)) {
    const after = d.slice(d.indexOf(bare[1]) + bare[1].length);
    const name = tidyName(after);
    return { kind: "person", code: null, name: name || null, accountRef, msisdn: bare[1] };
  }

  // ── Safaricom's own machinery: charges, overdraft bookkeeping, reversals. ─
  if (/\b(OverDraft of Credit Party|Charge|Reversal|Recharge|Bundle|Airtime)\b/i.test(d)) {
    return { kind: "system", code: null, name: null, accountRef, msisdn: null };
  }

  // ── Agent rows: "Customer Withdrawal at Agent Till 123456 - NAME" ─────────
  const agent = d.match(/Agent\s+Till\s+(\d{4,9})\s*-?\s*([^]{0,60}?)(?=\s*(?:Acc\.|Completed|$))/i);
  if (agent) {
    return { kind: "business", code: agent[1], name: tidyName(agent[2]) || "M-PESA agent", accountRef, msisdn: null };
  }

  return { ...EMPTY, accountRef };
}
