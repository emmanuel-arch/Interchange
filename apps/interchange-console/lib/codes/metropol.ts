// ─────────────────────────────────────────────────────────────────────────────
// BUREAU CODE TABLES — every code value Metropol returns, described in the
// Interchange's own words.
//
// ONE LIST, read by the report kit, the v1 API envelope and the /docs pages, so
// a code cannot mean one thing on a PDF and another in the JSON.
//
// ── WHY THE VALUES ARE UNCHANGED AND THE WORDS ARE OURS ──────────────────────
// A lender already integrated with the bureau switches on these values, so the
// Interchange passes every one of them through exactly as received. The
// descriptions are written here from what each code means to a credit decision.
// Metropol's developer guide is marked proprietary and may not be reproduced,
// so nothing below is copied from it — no tables, no examples, no wording.
//
// ── WHAT LIVE PULLS TAUGHT THAT NO TABLE SAYS ────────────────────────────────
// Recorded on the entries they concern, from production answers on 15–16 Sep
// 2026: E017 on an entitled report is a thin file rather than a failure, E029
// arrives before the subject is looked at (so it is a free entitlement probe),
// and `api_code` is sometimes a number and sometimes a string.
// ─────────────────────────────────────────────────────────────────────────────

export type CodeEntry = {
  code: string;
  label: string;
  /** What the code means for a lending decision. */
  meaning: string;
};

// ── Report types ─────────────────────────────────────────────────────────────

export type BureauReportType = {
  type: number;
  name: string;
  /** Path segment the bureau serves it on. */
  endpoint: string;
  /** What the lender learns from it, in one sentence. */
  answers: string;
  /** What arrives in the body. */
  contains: string[];
  /** On the contract holder's production subscription, swept 16 Sep 2026. */
  entitled: boolean;
  /** Needs `loan_amount` and `report_reason` in the request. */
  needsLoanContext: boolean;
};

export const BUREAU_REPORT_TYPES: BureauReportType[] = [
  { type: 1, name: "Identity Verification", endpoint: "/identity/verify", answers: "Whether the ID exists and who it belongs to.", contains: ["Registered names", "Date of birth", "Gender", "Citizenship", "ID serial", "Deceased marker"], entitled: true, needsLoanContext: false },
  { type: 2, name: "Delinquency Status", endpoint: "/delinquency/status", answers: "Whether the person is in default now, or has been.", contains: ["Delinquency code", "Summary line", "Loan amount asked about"], entitled: true, needsLoanContext: true },
  { type: 3, name: "Metro / Mobile Score", endpoint: "/score/consumer", answers: "The bureau's score for the person, or the mobile-lending variant.", contains: ["Score", "Date calculated", "Category"], entitled: true, needsLoanContext: false },
  { type: 4, name: "PDF Credit Report", endpoint: "/report/pdf", answers: "The bureau's own printed credit report.", contains: ["Base64 PDF", "Bureau reference number"], entitled: true, needsLoanContext: true },
  { type: 5, name: "JSON Credit Report", endpoint: "/report/json", answers: "The full credit file as structured data.", contains: ["Accounts", "Sector split", "Enquiry windows", "Payment performance index", "Reported names"], entitled: true, needsLoanContext: true },
  { type: 6, name: "Identity Scrub", endpoint: "/identity/scrub", answers: "Every contact and address trace lenders have reported.", contains: ["Name spellings", "Phones", "Emails", "Postal and physical addresses", "Employers"], entitled: true, needsLoanContext: false },
  { type: 8, name: "Credit Info", endpoint: "/report/credit_info", answers: "Every credit account on file, with the headline score.", contains: ["Accounts", "Sector split", "Enquiry windows", "Score", "Fraud and guarantor flags"], entitled: true, needsLoanContext: true },
  { type: 10, name: "Enhanced Credit Info", endpoint: "/report/credit_info_enhanced", answers: "Credit Info plus who guarantees the person and who holds a stake in them.", contains: ["Everything in report 8", "Guarantors", "Stakeholders"], entitled: true, needsLoanContext: true },
  { type: 11, name: "Credit Info with Income Estimate", endpoint: "/report/creditinfo/mobile", answers: "Credit Info plus the bureau's modelled monthly income.", contains: ["Everything in report 8", "Estimated income", "Phones on file"], entitled: true, needsLoanContext: true },
  { type: 12, name: "Full Enhanced Credit Info", endpoint: "/report/credit_info", answers: "The complete picture: identity, traces, accounts and a year of score history.", contains: ["Identity verification", "Identity scrub", "Accounts", "12-month score and PPI trend", "Guarantors", "Stakeholders"], entitled: true, needsLoanContext: true },
  { type: 13, name: "Minified Credit Info", endpoint: "/report/credit_info", answers: "One line: worst arrears, whether non-performing, total owed.", contains: ["Days in arrears", "NPL flag", "Negative history flag", "Outstanding balance"], entitled: true, needsLoanContext: true },
  { type: 14, name: "Full JSON Report", endpoint: "/report/json", answers: "The older full-file format: identity, traces, accounts, guarantors.", contains: ["Identity verification", "Identity scrub", "Accounts", "Guarantors", "Stakeholders"], entitled: true, needsLoanContext: true },
  { type: 16, name: "Credit Accounts Summary", endpoint: "/report/credit_info", answers: "Counts of mobile against generic loans, arrears, NPLs and the monthly instalment.", contains: ["Mobile and generic account counts", "Accounts in arrears", "NPL counts", "Monthly instalment on generic loans"], entitled: true, needsLoanContext: true },
  { type: 22, name: "Accounts Info (12-month history)", endpoint: "/report/credit_info", answers: "Month by month status of every account over the last year.", contains: ["Per-account monthly history", "Monthly score", "Outstanding and overdue totals"], entitled: false, needsLoanContext: true },
];

export const bureauReportType = (type: number) => BUREAU_REPORT_TYPES.find((r) => r.type === type) ?? null;

// ── Request vocabularies ─────────────────────────────────────────────────────

export const REPORT_REASONS: CodeEntry[] = [
  { code: "1", label: "New credit application", meaning: "The person has applied for credit and the lender is deciding." },
  { code: "2", label: "Review of existing credit", meaning: "The lender is reviewing a facility the person already holds." },
  { code: "3", label: "Verify customer details", meaning: "Confirming identity or contact details, with no credit decision attached." },
  { code: "4", label: "Customer's own request", meaning: "The person asked for their own report." },
];

export const IDENTITY_TYPES: CodeEntry[] = [
  { code: "001", label: "National ID", meaning: "Kenyan national identity card number." },
  { code: "002", label: "Passport", meaning: "Passport number." },
  { code: "003", label: "Service ID", meaning: "Armed or disciplined services identity number." },
  { code: "004", label: "Alien registration", meaning: "Foreign national registration certificate." },
  { code: "005", label: "Company registration", meaning: "Business or company registration number." },
];

// ── Response vocabularies ────────────────────────────────────────────────────

export const DELINQUENCY_CODES: (CodeEntry & { tone: "good" | "watch" | "bad" | "mute" })[] = [
  { code: "001", label: "Identity not found", meaning: "The bureau holds no record of this ID at all.", tone: "mute" },
  { code: "002", label: "No credit history", meaning: "The ID is known but no lender has reported an account against it — a thin file, not a clean one.", tone: "mute" },
  { code: "003", label: "No delinquency", meaning: "Credit history exists and no account has ever been non-performing.", tone: "good" },
  { code: "004", label: "Currently delinquent", meaning: "At least one account is non-performing right now.", tone: "bad" },
  { code: "005", label: "Delinquent in the past", meaning: "No account is non-performing now, but at least one was.", tone: "watch" },
];

export const LENDER_SECTORS: CodeEntry[] = [
  { code: "sector_bank", label: "Banks", meaning: "Commercial banks." },
  { code: "sector_mfb", label: "Microfinance banks", meaning: "Deposit-taking microfinance banks." },
  { code: "sector_mfi", label: "Microfinance institutions", meaning: "Credit-only microfinance institutions." },
  { code: "sector_sacco", label: "Saccos", meaning: "Savings and credit co-operatives." },
  { code: "sector_other", label: "Other lenders", meaning: "Every other reporting lender, including digital credit providers." },
];

/** Product type ids. 15, 16 and 17 are not used by the bureau. */
export const PRODUCT_TYPES: (CodeEntry & { id: number })[] = [
  { id: 1, code: "1", label: "Unknown", meaning: "The reporting lender did not classify the facility." },
  { id: 2, code: "2", label: "Current Account", meaning: "A transactional account with a credit element." },
  { id: 3, code: "3", label: "Loan Account", meaning: "A general term loan." },
  { id: 4, code: "4", label: "Credit Card", meaning: "Card credit line." },
  { id: 5, code: "5", label: "Line of Credit", meaning: "A drawable limit." },
  { id: 6, code: "6", label: "Revolving Credit", meaning: "Credit that is repaid and redrawn." },
  { id: 7, code: "7", label: "Overdraft", meaning: "An overdraft, including mobile overdraft products." },
  { id: 8, code: "8", label: "Credit Card", meaning: "Card credit line (second code in use for the same product)." },
  { id: 9, code: "9", label: "Business Working Capital", meaning: "Short-term business finance." },
  { id: 10, code: "10", label: "Business Expansion Loan", meaning: "Business growth finance." },
  { id: 11, code: "11", label: "Mortgage", meaning: "Property-secured lending." },
  { id: 12, code: "12", label: "Asset Finance Loan", meaning: "Finance secured on the asset bought." },
  { id: 13, code: "13", label: "Trade Finance Facility", meaning: "Import, export or supply-chain finance." },
  { id: 14, code: "14", label: "Personal Loan", meaning: "Unsecured consumer loan." },
  { id: 18, code: "18", label: "Mobile Banking Loan", meaning: "A loan disbursed and repaid through a mobile channel." },
  { id: 19, code: "19", label: "Other", meaning: "Classified by the lender as none of the above." },
];

export type AccountStatusEntry = CodeEntry & {
  /** Nothing further is owed, whatever the balance field says. */
  finished: boolean;
  /** A loss or enforcement event rather than a balance. */
  adverse: boolean;
};

/** Letter codes. Production answers usually send the word itself; both are understood. */
export const ACCOUNT_STATUSES: AccountStatusEntry[] = [
  { code: "-", label: "Unknown", meaning: "Status not reported.", finished: false, adverse: false },
  { code: "A", label: "Closed", meaning: "The facility is closed.", finished: true, adverse: false },
  { code: "B", label: "Dormant", meaning: "Open but not used.", finished: false, adverse: false },
  { code: "C", label: "Performing", meaning: "Open and being repaid on terms.", finished: false, adverse: false },
  { code: "D", label: "Non-Performing", meaning: "Open and in default.", finished: false, adverse: true },
  { code: "E", label: "Write-Off", meaning: "The lender has written the debt off as a loss.", finished: false, adverse: true },
  { code: "F", label: "Legal", meaning: "The debt is in legal proceedings.", finished: false, adverse: true },
  { code: "G", label: "Collection", meaning: "The debt has been passed to collections.", finished: false, adverse: true },
  { code: "H", label: "Active", meaning: "Open.", finished: false, adverse: false },
  { code: "I", label: "Terms Extended", meaning: "Repayment terms were extended or restructured.", finished: false, adverse: false },
  { code: "J", label: "Early Settlement", meaning: "Repaid in full before term.", finished: true, adverse: false },
  { code: "K", label: "Fully Settled", meaning: "Repaid in full.", finished: true, adverse: false },
  { code: "L", label: "Revoked", meaning: "The facility was withdrawn.", finished: true, adverse: false },
  { code: "M", label: "Suspended", meaning: "Use of the facility is suspended.", finished: false, adverse: true },
  { code: "N", label: "Not Updated", meaning: "The lender has not refreshed this account.", finished: false, adverse: false },
  { code: "P", label: "Paid Up", meaning: "Nothing further is owed.", finished: true, adverse: false },
  { code: "Q", label: "Disability, Deceased, Insurance Claim", meaning: "Closed through an insurance event.", finished: false, adverse: false },
  { code: "R", label: "Deferred", meaning: "Repayments are deferred by agreement.", finished: false, adverse: false },
];

export type ResponseCodeEntry = CodeEntry & {
  /** Who has to act: the caller's integration, the account holder, or nobody. */
  category: "success" | "request" | "authentication" | "account" | "subject" | "throttle" | "bureau";
  /** Safe to retry unchanged. */
  retryable: boolean;
  /** The subject is known and simply has nothing — a finding, not a failure. */
  finding?: boolean;
};

export const BUREAU_RESPONSE_CODES: ResponseCodeEntry[] = [
  { code: "E200", label: "Service available", meaning: "The bureau's health check is answering.", category: "success", retryable: false },
  { code: "E001", label: "Bureau internal error", meaning: "The bureau failed internally. Nothing is wrong with the request.", category: "bureau", retryable: true },
  { code: "E002", label: "API key missing", meaning: "The request carried no public key.", category: "authentication", retryable: false },
  { code: "E003", label: "Key not authorised", meaning: "The key exists but may not use this service or port.", category: "authentication", retryable: false },
  { code: "E004", label: "Public key invalid", meaning: "The public key has expired or been disabled.", category: "authentication", retryable: false },
  { code: "E005", label: "Wrong content type", meaning: "The body was not sent as application/json.", category: "request", retryable: false },
  { code: "E006", label: "Body is not valid JSON", meaning: "The request body could not be parsed.", category: "request", retryable: false },
  { code: "E007", label: "report_type missing", meaning: "The report_type field was absent.", category: "request", retryable: false },
  { code: "E008", label: "identity_number missing", meaning: "The identity_number field was absent.", category: "request", retryable: false },
  { code: "E009", label: "identity_type missing", meaning: "The identity_type field was absent.", category: "request", retryable: false },
  { code: "E010", label: "report_type empty", meaning: "The report_type field was present but blank.", category: "request", retryable: false },
  { code: "E011", label: "Unknown report type", meaning: "The report_type value is not one the bureau serves.", category: "request", retryable: false },
  { code: "E012", label: "identity_number empty", meaning: "The identity_number field was present but blank.", category: "request", retryable: false },
  { code: "E013", label: "identity_type empty", meaning: "The identity_type field was present but blank.", category: "request", retryable: false },
  { code: "E014", label: "Unknown identity type", meaning: "The identity_type value is not in the identity type list.", category: "request", retryable: false },
  { code: "E015", label: "Fields do not fit this report", meaning: "The combination of fields is not valid for the report type asked for.", category: "request", retryable: false },
  { code: "E016", label: "Service not open yet", meaning: "The bureau has not released this service for use.", category: "account", retryable: false },
  { code: "E017", label: "No record for this ID", meaning: "On an entitled report this is a thin or unknown file — record it as a finding, not an error. On a dummy ID it proves entitlement for free.", category: "subject", retryable: false, finding: true },
  { code: "E018", label: "Not a test identity", meaning: "Test keys only answer for the bureau's test IDs.", category: "subject", retryable: false },
  { code: "E019", label: "Identity type restricted", meaning: "This identity type is not open to the account.", category: "account", retryable: false },
  { code: "E020", label: "loan_amount missing", meaning: "This report type needs loan_amount.", category: "request", retryable: false },
  { code: "E021", label: "loan_amount empty", meaning: "The loan_amount field was present but blank.", category: "request", retryable: false },
  { code: "E022", label: "loan_amount invalid", meaning: "loan_amount is not a whole positive number.", category: "request", retryable: false },
  { code: "E023", label: "Timestamp missing", meaning: "The timestamp header was absent.", category: "authentication", retryable: false },
  { code: "E024", label: "Timestamp invalid", meaning: "The timestamp header is not in the expected format.", category: "authentication", retryable: true },
  { code: "E025", label: "Clock out of step", meaning: "The request arrived too long after it was signed. Check the server clock and send a fresh request.", category: "authentication", retryable: true },
  { code: "E026", label: "Hash missing", meaning: "The hash header was absent.", category: "authentication", retryable: false },
  { code: "E027", label: "Hash does not match", meaning: "The hash was computed over different bytes, or with the wrong private key.", category: "authentication", retryable: false },
  { code: "E028", label: "Account not fully set up", meaning: "The subscription is not yet activated at the bureau.", category: "account", retryable: false },
  { code: "E029", label: "Report not in contract", meaning: "The subscription does not include this report type. Answered before the subject is looked at.", category: "account", retryable: false },
  { code: "E030", label: "Private key invalid", meaning: "The private key has been revoked at the bureau.", category: "authentication", retryable: false },
  { code: "E031", label: "report_reason missing", meaning: "This report type needs report_reason.", category: "request", retryable: false },
  { code: "E032", label: "report_reason invalid", meaning: "report_reason is not a number.", category: "request", retryable: false },
  { code: "E033", label: "report_reason not recognised", meaning: "report_reason is not in the report reason list.", category: "request", retryable: false },
  { code: "E409", label: "Duplicate request", meaning: "The same request reached the bureau within the last minute. Wait, or use the answer already received.", category: "throttle", retryable: true },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

const byCode = <T extends CodeEntry>(list: T[]) => new Map(list.map((e) => [e.code, e]));
const DELINQUENCY_MAP = byCode(DELINQUENCY_CODES);
const STATUS_MAP = byCode(ACCOUNT_STATUSES);
const STATUS_BY_LABEL = new Map(ACCOUNT_STATUSES.map((e) => [e.label.toLowerCase(), e]));
const RESPONSE_MAP = byCode(BUREAU_RESPONSE_CODES);
const SECTOR_MAP = byCode(LENDER_SECTORS);
const IDENTITY_MAP = byCode(IDENTITY_TYPES);
const REASON_MAP = byCode(REPORT_REASONS);

export const delinquency = (code: string | null | undefined) => (code ? DELINQUENCY_MAP.get(code) ?? null : null);
export const productType = (id: number | null | undefined) => (id === null || id === undefined ? null : PRODUCT_TYPES.find((p) => p.id === Number(id)) ?? null);
export const sector = (code: string) => SECTOR_MAP.get(code) ?? null;
export const identityType = (code: string | null | undefined) => (code ? IDENTITY_MAP.get(code) ?? null : null);
export const reportReason = (code: string | number | null | undefined) => (code === null || code === undefined ? null : REASON_MAP.get(String(code)) ?? null);

/** A letter code or the word itself — production sends both. */
export function accountStatus(raw: string | null | undefined): AccountStatusEntry | null {
  if (!raw) return null;
  const s = raw.trim();
  return (s.length === 1 ? STATUS_MAP.get(s.toUpperCase()) : STATUS_BY_LABEL.get(s.toLowerCase())) ?? null;
}

/** `api_code` arrives as 200, "200", "E017" or null. Always a string or null after this. */
export function normaliseApiCode(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

export const responseCode = (v: unknown) => {
  const c = normaliseApiCode(v);
  return c ? RESPONSE_MAP.get(c) ?? null : null;
};
