// ─────────────────────────────────────────────────────────────────────────────
// THE INTERCHANGE JSON FORMAT — a bureau answer with its codes in words.
//
// The bureau's JSON is a set of codes a developer has to look up: "003", 7, "E",
// sector_other. This is the same answer with every code carried as BOTH its
// value and its meaning, provenance on the whole, and the reading the Interchange
// added kept apart from what the bureau said:
//
//   data     — what the bureau returned, restructured, never recomputed
//   reading  — what the Interchange computed from it: totals, bands, flags
//
// The envelope keeps the bureau's top-level keys (has_error, api_code,
// api_code_description) so a parser written for the bureau still finds them.
// ─────────────────────────────────────────────────────────────────────────────
import { totals, type BureauFile, type BureauAccount } from "./bureau";
import { scoreBand } from "./theme";
import { REGULATION_40_NOTICE, BUREAU_DISCLAIMER_LINES, INTERCHANGE_BUREAU_NOTICE, BUREAU_NAME } from "./notices";
import {
  accountStatus,
  bureauReportType,
  delinquency,
  identityType,
  productType,
  sector,
} from "../codes/metropol";
import { sha256, verifyUrl } from "./reference";

export type BureauResponseRef = {
  report_type: number;
  /** SHA-256 of the response body as it was captured. */
  sha256: string;
  /** "wire": the bureau's bytes. "unwrapped": the body after the capture tool lifted it out of its envelope. */
  capture: "wire" | "unwrapped";
  /** When the evidence is a block inside a bigger answer. */
  section_of?: number;
};

const coded = (code: string | number | null | undefined, label: string | null | undefined, meaning?: string) =>
  code === null || code === undefined ? null : { code: String(code), label: label ?? null, ...(meaning ? { meaning } : {}) };

function account(a: BureauAccount) {
  const status = accountStatus(a.status);
  const product = productType(a.productTypeId);
  return {
    account_number: a.accountNumber,
    product_type: product ? { id: product.id, label: product.label } : { id: a.productTypeId, label: a.product },
    status: { code: status?.code ?? null, label: a.status, finished: status?.finished ?? null, adverse: status?.adverse ?? null },
    date_opened: a.opened,
    original_amount: a.originalAmount,
    current_balance: a.currentBalance,
    overdue_balance: a.overdueBalance,
    overdue_date: a.overdueDate,
    days_in_arrears: { value: a.daysInArrears, as_of: a.loadedAt },
    highest_days_in_arrears: a.highestDaysInArrears,
    last_payment: { amount: a.lastPaymentAmount, date: a.lastPaymentDate },
    delinquency: coded(a.delinquencyCode, delinquency(a.delinquencyCode)?.label),
    reported_at: a.loadedAt,
    is_your_account: a.isYourAccount,
  };
}

/** The type-specific body. Only what the product is for — report 1 carries identity, not accounts. */
function dataFor(type: number, f: BureauFile) {
  const id = f.identity;
  const identity = {
    verified: id.verified,
    first_name: id.firstName,
    other_name: id.otherName,
    surname: id.surname,
    date_of_birth: id.dateOfBirth,
    date_of_death: id.dateOfDeath,
    gender: id.gender,
    citizenship: id.citizenship,
    marital_status: id.maritalStatus,
    id_serial: id.serialNumber,
  };
  const traces = {
    names: id.names,
    phones: id.phones,
    emails: id.emails,
    postal_addresses: id.postalAddresses,
    physical_addresses: id.physicalAddresses,
    employment: id.employment,
  };
  const d = delinquency(f.delinquency.code);
  const delinquencyBlock = d ? { code: d.code, label: d.label, meaning: d.meaning } : null;
  const score = { value: f.score.value, as_at: f.score.asAt, category: f.score.category };
  const ppi = f.ppi.rank ? { rank: f.ppi.rank, index: f.ppi.value, as_at: f.ppi.month } : null;
  const sectors = Object.entries(f.sectors).map(([code, v]) => ({
    sector: { code, label: sector(code)?.label ?? code },
    total: v.npa + v.performing + v.performingWithHistory,
    non_performing: v.npa,
    performing_with_default_history: v.performingWithHistory,
    performing_clean: v.performing,
  }));
  const windows = { enquiries: f.enquiries, credit_applications: f.applications, bounced_cheques: f.bouncedCheques };

  switch (type) {
    case 1:
      return { identity, reported_names: id.names };
    case 2:
      return { delinquency: delinquencyBlock };
    case 3:
      return { score, ppi };
    case 6:
      return { traces };
    case 16:
      return { accounts_summary: f.accountsSummary };
    case 13:
      return { delinquency: delinquencyBlock, accounts_summary: f.accountsSummary };
    default:
      return {
        identity,
        traces,
        score,
        score_trend: f.trend.map((p) => ({ month: p.month, score: p.score, ppi: p.ppi, ppi_rank: p.ppiRank })),
        ppi,
        delinquency: delinquencyBlock,
        accounts: f.accounts.map(account),
        sectors,
        windows,
        income_estimate: f.income.estimatedAmount,
        accounts_summary: f.accountsSummary,
        guarantors: f.guarantors,
        stakeholders: f.stakeholders,
        has_fraud: f.hasFraud,
        is_guarantor: f.isGuarantor,
      };
  }
}

function readingFor(type: number, f: BureauFile) {
  if (![5, 8, 10, 11, 12, 14].includes(type)) {
    return f.score.value !== null && type === 3
      ? { score_band: { label: scoreBand(f.score.value).label, basis: "market reading of the 200-900 range, not a bureau cut-off" } }
      : {};
  }
  const t = totals(f);
  return {
    live_exposure: { accounts: t.live, outstanding: t.outstanding, definition: "open and carrying a balance" },
    open_with_nil_balance: t.openButSettled,
    closed: t.closed,
    adverse_accounts: t.adverse,
    overdue_total: t.overdue,
    worst_days_in_arrears: t.worstArrears,
    worst_days_in_arrears_ever: t.worstArrearsEver,
    opened_last_6_months: t.openedLast6Months,
    opened_last_12_months: t.openedLast12Months,
    figure_age_days: { freshest: t.freshestReportDays, stalest: t.stalestReportDays },
    score_band: f.score.value !== null ? { label: scoreBand(f.score.value).label, basis: "market reading, not a bureau cut-off" } : null,
    notes: f.notes,
  };
}

export type EnvelopeInput = {
  type: number;
  file: BureauFile;
  reference: string;
  reportDate: string;
  requestedBy: { person?: string | null; organisation: string; memberCode: string };
  responses: BureauResponseRef[];
  sample?: boolean;
};

/** The Interchange envelope, and the digest the PDF prints beside its QR code. */
export function bureauEnvelope(input: EnvelopeInput) {
  const { type, file: f } = input;
  const def = bureauReportType(type);
  const data = dataFor(type, f);
  const contentDigest = sha256(JSON.stringify(data));

  return {
    contentDigest,
    envelope: {
      has_error: false,
      api_code: null,
      api_code_description: null,
      api_version: "v1",
      reference: input.reference,
      report: { type, name: def?.name ?? `Report ${type}`, product: "bureau_direct" },
      report_date: input.reportDate,
      requested_by: { person: input.requestedBy.person ?? null, organisation: input.requestedBy.organisation, member_code: input.requestedBy.memberCode },
      subject: {
        identity_type: coded(f.identity.identityType ?? "001", identityType(f.identity.identityType ?? "001")?.label),
        identity_number: f.identity.identityNumber,
      },
      provenance: {
        provider: BUREAU_NAME,
        bureau_report_types: f.sources,
        bureau_transaction_ids: f.trxIds,
        responses: input.responses,
        interchange_role: "Retrieved, kept unchanged, and presented. The Interchange is not a credit reference bureau.",
      },
      data,
      reading: readingFor(type, f),
      notices: {
        regulation_40_1: REGULATION_40_NOTICE,
        bureau_disclaimer: BUREAU_DISCLAIMER_LINES,
        interchange: INTERCHANGE_BUREAU_NOTICE,
      },
      verify: { url: verifyUrl(input.reference), content_sha256: contentDigest },
      ...(input.sample ? { sample: true } : {}),
    },
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The account ladder as CSV, one row per account, every code beside its label. */
export function accountsCsv(f: BureauFile): string {
  const head = [
    "account_number", "product_type_id", "product_type", "status", "date_opened", "original_amount", "current_balance",
    "overdue_balance", "days_in_arrears", "days_in_arrears_as_of", "highest_days_in_arrears", "last_payment_amount",
    "last_payment_date", "delinquency_code", "is_live", "is_adverse",
  ];
  const rows = f.accounts.map((a) =>
    [
      a.accountNumber, a.productTypeId, a.product, a.status, a.opened, a.originalAmount, a.currentBalance, a.overdueBalance,
      a.daysInArrears, a.loadedAt, a.highestDaysInArrears, a.lastPaymentAmount, a.lastPaymentDate, a.delinquencyCode,
      a.isLive, a.isAdverse,
    ].map(csvCell).join(","),
  );
  return [head.join(","), ...rows].join("\r\n") + "\r\n";
}
