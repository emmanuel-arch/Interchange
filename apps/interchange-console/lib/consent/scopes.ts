// ─────────────────────────────────────────────────────────────────────────────
// Consent scopes — the vocabulary the whole ecosystem is governed by.
//
// Counsel's condition for clearance was that every borrower agrees, provably,
// before their data moves. These are the units they agree to. Each is recorded
// and revoked independently; a loan requires the mandatory set.
//
// Why the mandatory set can lawfully be bundled: conditioning a loan on consent
// is defensible where the processing is genuinely necessary to provide the
// product — deciding whether to lend. Every mandatory scope below serves that
// assessment. The two that do not are optional, and that separation is what
// demonstrates the bundle is about lending rather than about collecting
// everything available.
//
// `model.train` is the one to keep an eye on. It is arguably necessary — the
// score that approves the next borrower is built from it — but it is the scope
// a regulator would probe hardest, and blueprint v2 §9 flags its exact wording
// as still needing counsel's sign-off.
// ─────────────────────────────────────────────────────────────────────────────

export const SCOPES = {
  "mpesa.crunch": {
    label: "M-Pesa statement analysis",
    mandatory: true,
    borrowerWording:
      "We will read the M-Pesa statement you upload and work out your income, spending patterns and existing repayments from it.",
  },
  "kyc.verify": {
    label: "Identity verification",
    mandatory: true,
    borrowerWording:
      "We will check that you are who you say you are, using your ID document and a photograph of your face.",
  },
  "bureau.pull": {
    label: "Credit reference bureau check",
    mandatory: true,
    borrowerWording:
      "We will ask a licensed credit reference bureau for your credit history.",
  },
  "ecosystem.exposure": {
    label: "Lending ecosystem check",
    mandatory: true,
    borrowerWording:
      "We will ask other lenders in this network whether you currently owe them money, and we will answer the same question about you when they ask. They are told amounts and status — never your name, ID number or phone number.",
  },
  "outcome.label": {
    label: "Loan outcome recording",
    mandatory: true,
    borrowerWording:
      "We will record how your loan ends — repaid, late or defaulted — and use that to improve how lending decisions are made.",
  },
  "model.train": {
    label: "Improving credit scoring",
    mandatory: true,
    borrowerWording:
      "Your information, with your name and ID removed so it cannot be traced back to you, will help train the systems that assess future applications.",
  },
  "collections.contact": {
    label: "Contact about repayment",
    mandatory: true,
    borrowerWording:
      "If you fall behind, we may contact you, and we may share how best to reach you with the lender collecting the debt.",
  },
  "identity.disclose": {
    label: "Lender name disclosure",
    mandatory: false,
    borrowerWording:
      "Other lenders in the network may be told our name alongside your balance, instead of only seeing an anonymous total.",
  },
  "marketing.offers": {
    label: "Offers from other lenders",
    mandatory: false,
    borrowerWording:
      "Other lenders in the network may send you offers you are likely to qualify for.",
  },
} as const;

export type Scope = keyof typeof SCOPES;

export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

export const MANDATORY_SCOPES = ALL_SCOPES.filter((s) => SCOPES[s].mandatory);
export const OPTIONAL_SCOPES = ALL_SCOPES.filter((s) => !SCOPES[s].mandatory);

export function isScope(value: string): value is Scope {
  return value in SCOPES;
}

/** True when the granted set covers everything the service requires. */
export function coversScopes(granted: string[], required: string[]): boolean {
  const held = new Set(granted);
  return required.every((r) => held.has(r));
}

/** Which required scopes are missing — for the refusal message and the audit row. */
export function missingScopes(granted: string[], required: string[]): string[] {
  const held = new Set(granted);
  return required.filter((r) => !held.has(r));
}
