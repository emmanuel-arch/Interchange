// ─────────────────────────────────────────────────────────────────────────────
// THE INTERCHANGE'S OWN RESPONSE CODES — the IX range.
//
// The bureau's E-codes keep exactly the meaning the bureau gives them (see
// ./metropol.ts), because a lender migrating from a direct bureau integration
// already switches on them. Everything the Interchange itself decides — who may
// ask, under what consent, whether reciprocity is met, whether a statement
// could be read — gets a code from THIS range instead, which never collides.
//
// Before this file, the v1 endpoint answered a consent refusal with E003 and an
// exhausted quota with E029. A lender's integration reads those as "your bureau
// key is not authorised" and "your bureau contract lacks this report", and goes
// to argue with the bureau about a problem the bureau does not have.
//
// Every error envelope says whose code it is: `api_code_source` is "bureau" when
// the bureau produced the code (passed through untouched, so E017 still means a
// thin file) and "interchange" when the Interchange decided.
// ─────────────────────────────────────────────────────────────────────────────

export type IxCode = {
  code: string;
  http: number;
  label: string;
  /** What happened, in terms of the lender's request. */
  meaning: string;
  /** What the caller should do next. */
  action: string;
  retryable: boolean;
};

export const IX_CODES = {
  // ── IX0xx · identity of the caller ────────────────────────────────────────
  IX001: { code: "IX001", http: 401, label: "Request not signed", meaning: "One or more of the member, timestamp, nonce or signature headers is missing.", action: "Sign every request with the member's private key. See Authentication.", retryable: false },
  IX002: { code: "IX002", http: 401, label: "Member has no registered key", meaning: "The member code is unknown, or no public key has been registered for it.", action: "Register the public key in the portal under API keys.", retryable: false },
  IX003: { code: "IX003", http: 401, label: "Signature does not verify", meaning: "The signature was not made over this exact request with the registered key.", action: "Sign the canonical string for the bytes actually sent. A proxy that rewrites the body breaks the signature.", retryable: false },
  IX004: { code: "IX004", http: 401, label: "Request too old", meaning: "The timestamp is outside the 60-second window.", action: "Synchronise the server clock (NTP) and send a freshly signed request.", retryable: true },
  IX005: { code: "IX005", http: 403, label: "Member not active", meaning: "The member is suspended or not yet admitted.", action: "Contact the ecosystem governor.", retryable: false },
  IX006: { code: "IX006", http: 403, label: "Address not allowed", meaning: "The call came from an address outside the member's allowlist.", action: "Add the address in the portal, or call from an allowed host.", retryable: false },

  // ── IX1xx · consent ───────────────────────────────────────────────────────
  IX101: { code: "IX101", http: 403, label: "No consent presented", meaning: "The request carried no consent_ref, or the Registry does not know it.", action: "Capture consent and send its reference.", retryable: false },
  IX102: { code: "IX102", http: 403, label: "Consent revoked or expired", meaning: "The borrower withdrew consent, or it has passed its expiry.", action: "Capture fresh consent from the borrower.", retryable: false },
  IX103: { code: "IX103", http: 403, label: "Consent does not cover this product", meaning: "The consent exists but its scopes do not include what this report reads.", action: "Capture consent with the missing scopes named in the description.", retryable: false },
  IX104: { code: "IX104", http: 403, label: "Consent belongs to another borrower", meaning: "The consent_ref was issued for a different subject than the one asked about.", action: "Use the consent captured from this borrower.", retryable: false },

  // ── IX2xx · reciprocity ───────────────────────────────────────────────────
  IX201: { code: "IX201", http: 403, label: "Member in shadow period", meaning: "The member contributes its book but may not query yet.", action: "Promotion is a governance decision once the shadow period is served.", retryable: false },
  IX202: { code: "IX202", http: 403, label: "Contribution has lapsed", meaning: "The member's published book is too old to keep query rights.", action: "Publish the book again; access returns automatically.", retryable: false },

  // ── IX3xx · quota and spend ───────────────────────────────────────────────
  IX301: { code: "IX301", http: 429, label: "Daily bureau cap reached", meaning: "The member has used today's allowance of bureau pulls.", action: "Wait for the 24-hour window to roll, or ask the governor to raise the cap.", retryable: true },
  IX302: { code: "IX302", http: 429, label: "Free tier used up", meaning: "Today's free calls for this product are used.", action: "Wait for the window to roll, or move to paid calls.", retryable: true },
  IX303: { code: "IX303", http: 403, label: "Product not subscribed", meaning: "The member is not subscribed to this product.", action: "Enable it in the portal, or ask the governor.", retryable: false },

  // ── IX4xx · the bureau ────────────────────────────────────────────────────
  IX401: { code: "IX401", http: 503, label: "Bureau unreachable", meaning: "The bureau did not answer, or the contract holder's node is down.", action: "Retry shortly. Nothing was billed.", retryable: true },
  IX402: { code: "IX402", http: 502, label: "Bureau failed without a code", meaning: "The bureau answered with an error that carried no bureau code of its own.", action: "Retry once. If it repeats, report the reference to support.", retryable: true },
  IX403: { code: "IX403", http: 403, label: "Bureau report not available to this member", meaning: "Bureau reports are not enabled for this member, or not in the bureau contract.", action: "Ask the governor which bureau products are enabled for you.", retryable: false },
  IX404: { code: "IX404", http: 503, label: "Bureau selling switched off", meaning: "Bureau pulls are disabled on this deployment.", action: "Try again later, or use the ecosystem products.", retryable: true },

  // ── IX5xx · statements ────────────────────────────────────────────────────
  IX501: { code: "IX501", http: 422, label: "Statement password needed", meaning: "The PDF is encrypted and no password was sent.", action: "Send the password from Safaricom's SMS.", retryable: false },
  IX502: { code: "IX502", http: 422, label: "Statement password wrong", meaning: "The password did not open the PDF.", action: "Check the SMS. On older statements it is the ID number.", retryable: false },
  IX503: { code: "IX503", http: 422, label: "Not an M-PESA statement", meaning: "The file opened but holds no M-PESA transactions that could be read.", action: "Upload the full statement PDF emailed by Safaricom.", retryable: false },
  IX504: { code: "IX504", http: 422, label: "Statement holder mismatch", meaning: "The name on the statement does not match the name on the enquiry.", action: "Confirm the statement belongs to this borrower.", retryable: false },
  IX505: { code: "IX505", http: 413, label: "File not accepted", meaning: "The upload is not a PDF, or is larger than 15 MB.", action: "Upload the original PDF.", retryable: false },

  // ── IX6xx · the answer ────────────────────────────────────────────────────
  IX601: { code: "IX601", http: 200, label: "Partial answer", meaning: "Some members did not answer in time. The result is a floor, not a total.", action: "Read `silent` for who and why. Retry if the decision depends on completeness.", retryable: true },
  IX602: { code: "IX602", http: 503, label: "Product specified, not live", meaning: "The product is in the catalogue but does not answer yet.", action: "Check /api/v1/catalogue for its state.", retryable: false },
  IX603: { code: "IX603", http: 503, label: "Format not available here", meaning: "This deployment cannot render the format asked for, usually PDF.", action: "Request json, or call the engine host.", retryable: true },

  // ── IX7xx · the subject ───────────────────────────────────────────────────
  IX701: { code: "IX701", http: 409, label: "Token and ID disagree", meaning: "The subject_token sent does not match the token derived from identity_number.", action: "Your node's normalisation has drifted from the Registry's. Send the ID alone.", retryable: false },
  IX702: { code: "IX702", http: 400, label: "Bureau product needs the ID", meaning: "A bureau cannot look up a subject token, so this product needs identity_number.", action: "Send identity_number and identity_type.", retryable: false },
} as const satisfies Record<string, IxCode>;

export type IxCodeKey = keyof typeof IX_CODES;

export const IX_LIST: IxCode[] = Object.values(IX_CODES);

/** The error envelope, Metropol-shaped so existing parsers keep working. */
export function ixError(key: IxCodeKey, detail?: string, extra: Record<string, unknown> = {}) {
  const c = IX_CODES[key];
  return {
    body: {
      has_error: true,
      api_code: c.code,
      api_code_description: detail ?? c.meaning,
      retryable: c.retryable,
      ...extra,
    },
    status: c.http,
  };
}
