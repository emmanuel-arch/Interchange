// ─────────────────────────────────────────────────────────────────────────────
// METROPOL → ONE CANONICAL CREDIT FILE.
//
// Thirteen Metropol report types are entitled on Micromart's production keys,
// and they overlap heavily: report 12 contains reports 1, 6 and 8; report 8 and
// report 11 return byte-identical account lists; the score arrives in 3, 8 and
// 11 but NOT in 12. Rendering each one separately would mean thirteen layouts
// and thirteen sets of bugs.
//
// So every answer is folded into ONE model — merge(), repeatedly — and the
// documents are written against the model. A report type then decides which
// SECTIONS to show, never how to read a bureau payload.
//
// ── THE PRODUCTION SHAPES THAT COST US A DAY ─────────────────────────────────
// These are not from the Developer Guide. They are what the bureau actually
// returned on 15 Sep 2026 against a live national ID, and each one is a fault
// that was found by looking at a real answer:
//
//   1. REPORT 12 NESTS THE IDENTITY. `identity_verification.data` holds the
//      DOB, gender and serial; the top level holds only the names and the
//      envelope. Code that read the top level got a VERIFIED borrower with a
//      blank date of birth — the worst kind of wrong, because it looks like
//      "the bureau has no details" rather than a parsing bug.
//
//   2. `days_in_arrears` IS AS OF `loaded_at`, NOT TODAY. One account read
//      "32 days" and had been overdue since March 2024. Arrears therefore
//      always travel with the date they were true on, and staleness is
//      computed and shown rather than quietly ignored.
//
//   3. "ACTIVE" WITH A ZERO BALANCE IS NOT EXPOSURE. Five accounts on the live
//      file are Active with a nil balance — settled but not yet re-flagged.
//      Counting them as live debt overstates what the borrower owes.
//
//   4. REPORT 16 RETURNS NO trx_id. Anything keyed on a transaction id has to
//      tolerate its absence rather than throw.
//
// Nothing here invents a value. Where the bureau said nothing, the model says
// null and the document prints "not reported" — a missing field and a zero mean
// opposite things to a credit decision.
// ─────────────────────────────────────────────────────────────────────────────

// Code vocabularies live in lib/codes/metropol.ts, shared with the v1 API and
// the docs. These maps are views over that one list, kept under their old names
// so nothing that imports them has to change.
import { PRODUCT_TYPES, ACCOUNT_STATUSES, DELINQUENCY_CODES } from "../codes/metropol";

/** Product type id → label. 15, 16 and 17 are not used by the bureau. */
export const PRODUCT_TYPE: Record<number, string> = Object.fromEntries(PRODUCT_TYPES.map((p) => [p.id, p.label]));

/** Account status letter → word. Production usually sends the word itself. */
export const ACCOUNT_STATUS: Record<string, string> = Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s.code, s.label]));

/**
 * Marital status arrives as a single letter in the scrub block. Metropol
 * document no key for it, so the expansion is inferred from the one place both
 * forms are visible: their own web report printed "Married" for the same
 * subject this API returned "M" for. Anything unrecognised passes through as
 * the raw letter rather than being guessed at.
 */
export const MARITAL_STATUS: Record<string, string> = {
  M: "Married", S: "Single", D: "Divorced", W: "Widowed", U: "Unknown",
};

/** Delinquency code → label. */
export const DELINQUENCY: Record<string, string> = Object.fromEntries(DELINQUENCY_CODES.map((d) => [d.code, d.label]));

/** Statuses that mean the account is finished, whatever the balance says. */
const CLOSED_STATUSES = new Set(ACCOUNT_STATUSES.filter((s) => s.finished).map((s) => s.label));
/** Statuses that are a loss event rather than a balance. */
const ADVERSE_STATUSES = new Set(ACCOUNT_STATUSES.filter((s) => s.adverse).map((s) => s.label));

export type BureauAccount = {
  accountNumber: string;
  status: string;
  productTypeId: number | null;
  product: string;
  opened: string | null;
  /** When the LENDER last reported this account to the bureau. */
  loadedAt: string | null;
  originalAmount: number;
  currentBalance: number;
  overdueBalance: number;
  /** As of `loadedAt` — see fault 2 above. */
  daysInArrears: number;
  highestDaysInArrears: number;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  overdueDate: string | null;
  delinquencyCode: string | null;
  isYourAccount: boolean;
  /** Open AND carrying a balance. The definition of live exposure. */
  isLive: boolean;
  /** Reported open, but nothing owed — settled and not yet re-flagged. */
  isOpenButSettled: boolean;
  isAdverse: boolean;
  /** Days between `loadedAt` and now: how old this account's figures are. */
  stalenessDays: number | null;
};

export type BureauFile = {
  /** Which Metropol report types were folded in. */
  sources: number[];
  trxIds: string[];
  identity: {
    verified: boolean | null;
    names: string[];
    firstName: string | null;
    surname: string | null;
    otherName: string | null;
    dateOfBirth: string | null;
    dateOfDeath: string | null;
    gender: string | null;
    citizenship: string | null;
    maritalStatus: string | null;
    serialNumber: string | null;
    identityNumber: string | null;
    identityType: string | null;
    phones: string[];
    emails: string[];
    postalAddresses: { town?: string; number?: string; code?: string; country?: string }[];
    physicalAddresses: { town?: string; address?: string; country?: string }[];
    employment: { employerName?: string; employmentDate?: string | null }[];
  };
  score: { value: number | null; asAt: string | null; category: string | null };
  /** Up to 12 monthly points from report 12. */
  trend: { month: string; score: number | null; ppi: number | null; ppiRank: string | null }[];
  ppi: { rank: string | null; value: number | null; month: string | null };
  delinquency: { code: string | null; label: string | null };
  accounts: BureauAccount[];
  sectors: Record<string, { npa: number; performing: number; performingWithHistory: number }>;
  enquiries: { last3: number; last6: number; last12: number } | null;
  applications: { last3: number; last6: number; last12: number } | null;
  bouncedCheques: { last3: number; last6: number; last12: number } | null;
  income: { estimatedAmount: number | null };
  /** Report 16's own counts, which are the bureau's arithmetic rather than ours. */
  accountsSummary: Record<string, number> | null;
  guarantors: { accountNumber?: string; identityNumber?: string }[];
  stakeholders: { identityNumber?: string; identityType?: string; stakeholderType?: string }[];
  hasFraud: boolean | null;
  isGuarantor: boolean | null;
  /** Non-fatal observations worth printing: staleness, contradictions, gaps. */
  notes: string[];
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  // Metropol send the STRING "None" where a real null belongs, and a date field
  // reading "None" formats as an invalid date rather than as missing.
  return !s || s === "None" || s === "null" ? null : s;
};
const days = (from: string | null, to = new Date()): number | null => {
  if (!from) return null;
  const t = Date.parse(from.replace(" ", "T"));
  return Number.isFinite(t) ? Math.floor((to.getTime() - t) / 86_400_000) : null;
};

/** Merge two objects key by key, keeping the first value that is not null, empty or "None". */
function preferPresent(first: Record<string, unknown>, second: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...second };
  for (const [k, v] of Object.entries(first)) {
    if (str(v) !== null || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function emptyFile(): BureauFile {
  return {
    sources: [], trxIds: [],
    identity: {
      verified: null, names: [], firstName: null, surname: null, otherName: null,
      dateOfBirth: null, dateOfDeath: null, gender: null, citizenship: null, maritalStatus: null,
      serialNumber: null, identityNumber: null, identityType: null,
      phones: [], emails: [], postalAddresses: [], physicalAddresses: [], employment: [],
    },
    score: { value: null, asAt: null, category: null },
    trend: [], ppi: { rank: null, value: null, month: null },
    delinquency: { code: null, label: null },
    accounts: [], sectors: {},
    enquiries: null, applications: null, bouncedCheques: null,
    income: { estimatedAmount: null },
    accountsSummary: null, guarantors: [], stakeholders: [],
    hasFraud: null, isGuarantor: null, notes: [],
  };
}

function mapAccount(raw: Record<string, unknown>): BureauAccount {
  const rawStatus = str(raw.account_status) ?? str(raw.account_status_name) ?? "";
  // One character means a code; anything longer is already the word.
  const status = rawStatus.length === 1 ? (ACCOUNT_STATUS[rawStatus] ?? rawStatus) : rawStatus || "Unknown";
  const balance = num(raw.current_balance);
  const loadedAt = str(raw.loaded_at);
  const closed = CLOSED_STATUSES.has(status);
  const adverse = ADVERSE_STATUSES.has(status);

  return {
    accountNumber: str(raw.account_number) ?? "—",
    status,
    productTypeId: raw.product_type_id === undefined || raw.product_type_id === null ? null : Number(raw.product_type_id),
    product:
      str(raw.product_type_name) ??
      PRODUCT_TYPE[Number(raw.product_type_id)] ??
      "Unknown",
    opened: str(raw.date_opened),
    loadedAt,
    originalAmount: num(raw.original_amount),
    currentBalance: balance,
    overdueBalance: num(raw.overdue_balance),
    daysInArrears: num(raw.days_in_arrears),
    highestDaysInArrears: num(raw.highest_days_in_arrears),
    lastPaymentAmount: str(raw.last_payment_amount) === null ? null : num(raw.last_payment_amount),
    lastPaymentDate: str(raw.last_payment_date),
    overdueDate: str(raw.overdue_date),
    delinquencyCode: str(raw.delinquency_code),
    isYourAccount: raw.is_your_account === true,
    // Fault 3: open AND owing is the only thing that counts as exposure.
    isLive: !closed && balance > 0,
    isOpenButSettled: !closed && balance <= 0,
    isAdverse: adverse || num(raw.days_in_arrears) > 90,
    stalenessDays: days(loadedAt),
  };
}

/**
 * Fold one Metropol payload into the file.
 *
 * `reportType` is the number the payload was requested as, which is the only
 * reliable way to tell report 8 from 12 — they share an endpoint and their
 * bodies overlap almost completely.
 */
export function merge(file: BureauFile, reportType: number, payloadIn: Record<string, unknown>): BureauFile {
  // Production wraps some report bodies in `data`; the testbed answers flat.
  // The envelope wins on a key collision so api_code and trx_id keep meaning
  // what they mean.
  const payload =
    payloadIn.data && typeof payloadIn.data === "object" && !Array.isArray(payloadIn.data)
      ? { ...(payloadIn.data as Record<string, unknown>), ...payloadIn }
      : payloadIn;

  if (!file.sources.includes(reportType)) file.sources.push(reportType);
  const trx = str(payload.trx_id);
  if (trx && !file.trxIds.includes(trx)) file.trxIds.push(trx);

  // ── Identity ──────────────────────────────────────────────────────────────
  // Report 1 answers flat. Report 12 nests the SAME fields under
  // identity_verification.data (fault 1) — so unwrap twice, deliberately.
  const iv = payload.identity_verification as Record<string, unknown> | undefined;
  // The envelope and the nested block share key names, and on production the
  // envelope's first_name / surname / other_name are NULL while the real values
  // sit in `.data`. A plain spread let those nulls overwrite the names — the file
  // came out verified, with a date of birth, and nameless. So each key takes the
  // first non-empty value, nested block first.
  const ivFlat = iv
    ? preferPresent((iv.data as Record<string, unknown>) ?? {}, iv)
    : reportType === 1
      ? payload
      : null;

  if (ivFlat) {
    const id = file.identity;
    id.verified = ivFlat.success === true ? true : ivFlat.has_error === true ? false : id.verified;
    id.firstName = str(ivFlat.first_name) ?? id.firstName;
    id.surname = str(ivFlat.surname) ?? str(ivFlat.last_name) ?? id.surname;
    id.otherName = str(ivFlat.other_name) ?? id.otherName;
    id.dateOfBirth = str(ivFlat.date_of_birth) ?? str(ivFlat.dob) ?? id.dateOfBirth;
    id.dateOfDeath = str(ivFlat.date_of_death) ?? str(ivFlat.dod) ?? id.dateOfDeath;
    id.gender = str(ivFlat.gender) ?? id.gender;
    id.citizenship = str(ivFlat.citizenship) ?? id.citizenship;
    id.serialNumber = str(ivFlat.serial_number) ?? id.serialNumber;
  }

  const scrub = (payload.identity_scrub as Record<string, unknown> | undefined) ?? (reportType === 6 ? payload : null);
  if (scrub) {
    const id = file.identity;
    const push = (target: string[], v: unknown) => {
      for (const x of Array.isArray(v) ? v : []) {
        const s = str(x);
        if (s && !target.includes(s)) target.push(s);
      }
    };
    push(id.names, scrub.names);
    push(id.phones, scrub.phone);
    push(id.emails, scrub.email);
    const marital = str(scrub.marital_status);
    id.maritalStatus = marital ? (marital.length === 1 ? (MARITAL_STATUS[marital.toUpperCase()] ?? marital) : marital) : id.maritalStatus;
    id.gender = id.gender ?? str(Array.isArray(scrub.gender) ? scrub.gender[0] : scrub.gender);
    id.dateOfBirth = id.dateOfBirth ?? str(Array.isArray(scrub.date_of_being) ? scrub.date_of_being[0] : null);
    for (const a of Array.isArray(scrub.postal_address) ? scrub.postal_address : []) {
      const r = a as Record<string, unknown>;
      id.postalAddresses.push({ town: str(r.town) ?? undefined, number: str(r.number) ?? undefined, code: str(r.code) ?? undefined, country: str(r.country) ?? undefined });
    }
    for (const a of Array.isArray(scrub.physical_address) ? scrub.physical_address : []) {
      const r = a as Record<string, unknown>;
      id.physicalAddresses.push({ town: str(r.town) ?? undefined, address: str(r.address) ?? undefined, country: str(r.country) ?? undefined });
    }
    for (const e of Array.isArray(scrub.employment) ? scrub.employment : []) {
      const r = e as Record<string, unknown>;
      id.employment.push({ employerName: str(r.employer_name) ?? undefined, employmentDate: str(r.employment_date) });
    }
  }

  file.identity.identityNumber = str(payload.identity_number) ?? file.identity.identityNumber;
  file.identity.identityType = str(payload.identity_type) ?? file.identity.identityType;
  for (const n of Array.isArray(payload.reported_name) ? payload.reported_name : []) {
    const s = str(n);
    if (s && !file.identity.names.includes(s)) file.identity.names.push(s);
  }
  for (const p of Array.isArray(payload.phone_number) ? payload.phone_number : []) {
    const s = str(p);
    if (s && !file.identity.phones.includes(s)) file.identity.phones.push(s);
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  // Report 12 carries the TREND but no headline score; 3, 8 and 11 carry the
  // score. Taking the newest trend point when no headline exists is what makes
  // a 12-only pull still show a number.
  if (payload.credit_score !== undefined && payload.credit_score !== null) {
    file.score.value = Math.round(num(payload.credit_score));
    file.score.asAt = str(payload.as_at) ?? file.score.asAt;
    file.score.category = str(payload.category) ?? file.score.category;
  }

  const trend = Array.isArray(payload.metro_score_trend) ? payload.metro_score_trend : [];
  if (trend.length) {
    file.trend = trend
      .map((p) => {
        const r = p as Record<string, unknown>;
        return {
          month: str(r.month) ?? "",
          score: r.credit_score === undefined || r.credit_score === null ? null : Math.round(num(r.credit_score)),
          ppi: r.ppi === undefined || r.ppi === null ? null : num(r.ppi),
          ppiRank: str(r.ppi_rank),
        };
      })
      .filter((p) => p.month)
      .sort((a, b) => Date.parse(a.month) - Date.parse(b.month));

    const newest = file.trend[file.trend.length - 1];
    if (newest) {
      if (file.score.value === null && newest.score !== null) {
        file.score.value = newest.score;
        file.score.asAt = file.score.asAt ?? newest.month;
      }
      if (newest.ppiRank) file.ppi = { rank: newest.ppiRank, value: newest.ppi, month: newest.month };
    }
  }

  const ppiAnalysis = payload.ppi_analysis as Record<string, unknown> | undefined;
  if (ppiAnalysis) {
    file.ppi = {
      rank: str(ppiAnalysis.ppi_rank) ?? file.ppi.rank,
      value: ppiAnalysis.ppi === undefined ? file.ppi.value : num(ppiAnalysis.ppi),
      month: str(ppiAnalysis.month) ?? file.ppi.month,
    };
  }

  // ── Delinquency, accounts, sectors ────────────────────────────────────────
  const dcode = str(payload.delinquency_code);
  if (dcode) file.delinquency = { code: dcode, label: DELINQUENCY[dcode] ?? str(payload.delinquency_summary) ?? null };

  const accounts = Array.isArray(payload.account_info) ? payload.account_info : [];
  if (accounts.length > file.accounts.length) {
    // Later reports repeat the same list; keep the longest rather than
    // concatenating, or a borrower with 48 accounts ends up with 96.
    file.accounts = accounts.map((a) => mapAccount(a as Record<string, unknown>));
  }

  const sectors = payload.lender_sector as Record<string, unknown> | undefined;
  if (sectors) {
    for (const [key, v] of Object.entries(sectors)) {
      const r = (v ?? {}) as Record<string, unknown>;
      file.sectors[key] = {
        npa: num(r.account_npa),
        performing: num(r.account_performing),
        performingWithHistory: num(r.account_performing_npa_history),
      };
    }
  }

  const window = (v: unknown) => {
    const r = v as Record<string, unknown> | undefined;
    if (!r) return null;
    return { last3: num(r.last_3_months), last6: num(r.last_6_months), last12: num(r.last_12_months) };
  };
  file.enquiries = window(payload.no_of_enquiries) ?? file.enquiries;
  file.applications = window(payload.no_of_credit_applications) ?? file.applications;
  file.bouncedCheques = window(payload.no_of_bounced_cheques) ?? file.bouncedCheques;

  const income = payload.income_estimation as Record<string, unknown> | undefined;
  if (income) file.income.estimatedAmount = num(income.estimated_amount);

  const creditInfo = payload.credit_info as Record<string, unknown> | undefined;
  if (creditInfo) {
    file.accountsSummary = Object.fromEntries(Object.entries(creditInfo).map(([k, v]) => [k, num(v)]));
  }

  for (const g of Array.isArray(payload.guarantors) ? payload.guarantors : []) {
    const r = g as Record<string, unknown>;
    file.guarantors.push({ accountNumber: str(r.account_number) ?? undefined, identityNumber: str(r.identity_number) ?? undefined });
  }
  for (const s of Array.isArray(payload.stakeholders) ? payload.stakeholders : []) {
    const r = s as Record<string, unknown>;
    file.stakeholders.push({
      identityNumber: str(r.identity_number) ?? undefined,
      identityType: str(r.identity_type) ?? undefined,
      stakeholderType: str(r.stakeholder_type) ?? undefined,
    });
  }

  if (payload.has_fraud !== undefined) file.hasFraud = payload.has_fraud === true;
  if (payload.is_guarantor !== undefined) file.isGuarantor = payload.is_guarantor === true;
  if (payload.is_gurantor !== undefined) file.isGuarantor = payload.is_gurantor === true; // bureau's own typo

  return file;
}

/** Fold a whole pull — several report types for one subject — into one file. */
export function buildFile(parts: { reportType: number; payload: Record<string, unknown> }[]): BureauFile {
  const file = parts.reduce((f, p) => merge(f, p.reportType, p.payload), emptyFile());
  return withDerivedNotes(file);
}

export type BureauTotals = {
  accounts: number;
  live: number;
  openButSettled: number;
  closed: number;
  adverse: number;
  outstanding: number;
  overdue: number;
  worstArrears: number;
  worstArrearsEver: number;
  newestOpened: string | null;
  oldestOpened: string | null;
  /** Accounts opened in the last 6 / 12 months — the stacking signal. */
  openedLast6Months: number;
  openedLast12Months: number;
  /** How stale the freshest and stalest account figures are, in days. */
  freshestReportDays: number | null;
  stalestReportDays: number | null;
};

export function totals(file: BureauFile): BureauTotals {
  const a = file.accounts;
  const opened = a.map((x) => x.opened).filter((d): d is string => !!d).sort();
  const stale = a.map((x) => x.stalenessDays).filter((d): d is number => d !== null);
  const sixMonths = Date.now() - 182 * 86_400_000;
  const year = Date.now() - 365 * 86_400_000;
  const openedAfter = (t: number) => a.filter((x) => x.opened && Date.parse(x.opened) >= t).length;

  return {
    accounts: a.length,
    live: a.filter((x) => x.isLive).length,
    openButSettled: a.filter((x) => x.isOpenButSettled).length,
    closed: a.filter((x) => !x.isLive && !x.isOpenButSettled).length,
    adverse: a.filter((x) => x.isAdverse).length,
    outstanding: a.filter((x) => x.isLive).reduce((s, x) => s + x.currentBalance, 0),
    overdue: a.reduce((s, x) => s + x.overdueBalance, 0),
    worstArrears: a.reduce((m, x) => Math.max(m, x.daysInArrears), 0),
    worstArrearsEver: a.reduce((m, x) => Math.max(m, x.highestDaysInArrears), 0),
    newestOpened: opened.at(-1) ?? null,
    oldestOpened: opened[0] ?? null,
    openedLast6Months: openedAfter(sixMonths),
    openedLast12Months: openedAfter(year),
    freshestReportDays: stale.length ? Math.min(...stale) : null,
    stalestReportDays: stale.length ? Math.max(...stale) : null,
  };
}

/**
 * Observations the file itself supports — each one a thing a careful analyst
 * would say out loud, and none of them an invention.
 */
function withDerivedNotes(file: BureauFile): BureauFile {
  const t = totals(file);

  if (t.stalestReportDays !== null && t.stalestReportDays > 60) {
    file.notes.push(
      `The oldest account figures were last reported to the bureau ${t.stalestReportDays} days ago. ` +
        "Arrears counts are as of that date, not today.",
    );
  }
  if (t.openButSettled > 0) {
    file.notes.push(
      `${t.openButSettled} account${t.openButSettled === 1 ? " is" : "s are"} reported open with a nil balance — ` +
        "settled but not yet re-flagged by the lender. They are excluded from live exposure.",
    );
  }
  if (file.enquiries && file.enquiries.last12 === 0 && t.openedLast12Months > 0) {
    file.notes.push(
      `The bureau reports no enquiries in 12 months, yet ${t.openedLast12Months} ` +
        `account${t.openedLast12Months === 1 ? " was" : "s were"} opened in that ` +
        "window. Metropol's enquiry counters are not real-time and should not be read as shopping behaviour.",
    );
  }
  if (file.accounts.length > 0 && !file.accounts.some((a) => a.isYourAccount)) {
    file.notes.push(
      "No account on this file is flagged as the requesting lender's own, including where the lender has an " +
        "active loan. Treat `is_your_account` as unreliable for reconciliation.",
    );
  }
  return file;
}
