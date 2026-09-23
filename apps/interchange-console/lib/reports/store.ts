// ─────────────────────────────────────────────────────────────────────────────
// THE REPORT STORE — writing a pull down, and serving it back.
//
// Two functions carry the whole idea:
//
//   freshPull()   Is there an answer to this exact question, for this subject,
//                 inside retention? If so the caller gets it WITHOUT a billed
//                 call, and the document says so on its face.
//   recordPull()  Persist what came back: the verbatim wire, the normalised
//                 file the renderer consumed, and the typed facet that makes
//                 the data points queryable.
//
// ── WHY A RE-SERVE IS NOT A CACHE ────────────────────────────────────────────
// A cache is an optimisation you may skip. This is a LENDING RECORD. When two
// officers open the same customer an hour apart they must see the same file —
// not two files bought an hour apart that happen to differ because the bureau
// reloaded a submission in between. The stored answer is the one the decision
// was made against, and it is dated when the BUREAU gave it, never when it was
// read back. That is also why `pulledAt` is copied onto the document rather
// than regenerated: a report that re-dates itself on every open is a report
// that cannot be produced in a dispute.
//
// ── RETENTION IS A CEILING, NOT A TARGET ─────────────────────────────────────
// `expiresAt` is written at pull time from the member's policy, and never
// recomputed. Shortening a policy stops NEW pulls being kept so long; it does
// not retroactively invalidate a receipt already issued, because the receipt is
// evidence and evidence does not get shorter because a setting changed.
//
// After expiry the row is not deleted. `purge()` clears the personal data — the
// wire, the normalised file, every facet — and keeps the spine: who asked, when,
// under which consent, what it cost, and which log entry proves it. The subject
// is a token, so what survives is a billing and audit record about nobody in
// particular, which is exactly what should survive.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma, PullSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BureauFile } from "./bureau";
import { totals } from "./bureau";

/** Days a pull is servable when nothing else says otherwise. */
export const DEFAULT_RETENTION_DAYS = 30;

/**
 * How long this member keeps a pull of this type.
 *
 * Read from the member's policy document where they have set one, so a member
 * who is required by their own compliance to hold a bureau file for ninety days
 * can say so without a schema change. Clamped, because a retention of zero
 * would make every pull a fresh pull (and every quote a new bill), and one of a
 * thousand days would keep personal data long past any lawful basis for it.
 */
export async function retentionDays(memberCode: string, reportType: number): Promise<number> {
  const row = await prisma.memberPolicy
    .findUnique({ where: { memberCode }, select: { settings: true } })
    .catch(() => null);
  const s = (row?.settings ?? {}) as Record<string, unknown>;
  const ret = (s.retention ?? {}) as Record<string, unknown>;
  const byType = (ret.byReportType ?? {}) as Record<string, unknown>;
  const raw = byType[String(reportType)] ?? ret.days;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.max(Math.round(n), 1), 365);
}

export type StoredPull = {
  id: string;
  reportType: number;
  /** When the BUREAU answered — never when this row was read back. */
  pulledAt: Date;
  expiresAt: Date;
  source: PullSource;
  consentRef: string | null;
  billedPulls: number;
  logSeq: string | null;
  logHash: string | null;
  trxIds: string[];
  /** The bureau's own body, keyed by report number. */
  wire: Record<string, unknown>;
  /** The normalised file the renderer consumed, when one was stored. */
  normalised: Record<string, unknown> | null;
};

/**
 * The newest servable answer to this question, or null.
 *
 * Scoped to the CALLER as well as the subject. Two members asking about the
 * same borrower are two separate lawful bases, two separate consents and two
 * separate bills — serving one member's paid file to another because the token
 * matched would be a data-sharing decision nobody made.
 */
export async function freshPull(args: {
  subjectToken: string;
  reportType: number;
  callerId: string;
  /** Skip the store and force a live pull. */
  fresh?: boolean;
  now?: Date;
}): Promise<StoredPull | null> {
  if (args.fresh) return null;
  const now = args.now ?? new Date();
  const row = await prisma.reportPull.findFirst({
    where: {
      subjectToken: args.subjectToken,
      reportType: args.reportType,
      callerId: args.callerId,
      expiresAt: { gt: now },
      purgedAt: null,
      // A refusal is recorded too, and must never be re-served as an answer.
      source: { in: [PullSource.BUREAU, PullSource.DERIVED] },
    },
    orderBy: { pulledAt: "desc" },
    select: {
      id: true, reportType: true, pulledAt: true, expiresAt: true, source: true,
      consentRef: true, billedPulls: true, logSeq: true, logHash: true, trxIds: true,
      wire: true, normalised: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    logSeq: row.logSeq != null ? row.logSeq.toString() : null,
    wire: (row.wire ?? {}) as Record<string, unknown>,
    normalised: (row.normalised ?? null) as Record<string, unknown> | null,
  };
}

export type RecordArgs = {
  subjectToken: string;
  callerId: string;
  callerCode: string;
  reportType: number;
  bureauReports?: number[];
  consentRef?: string | null;
  source?: PullSource;
  billedPulls?: number;
  latencyMs?: number | null;
  logSeq?: bigint | string | null;
  logHash?: string | null;
  trxIds?: string[];
  wire: unknown;
  normalised?: unknown;
  /** Days this answer stays servable. Defaults to the member's policy. */
  retentionDays?: number;
  /** The typed facet to write beside the spine, when the type has one. */
  facet?: Facet;
};

export type Facet =
  | { kind: "credit"; file: BureauFile }
  | { kind: "cashflow"; cashflow: CashflowFacet }
  | { kind: "identity"; identity: IdentityFacet }
  | { kind: "exposure"; exposure: ExposureFacet };

export type CashflowFacet = {
  features: Record<string, number | string | null | undefined>;
  monthly: { month: string; income: number; expense: number; net: number; gambling: number }[];
  affordability?: { score?: number; band?: string; recommendedMaxInstallment?: number; reasons?: unknown } | null;
  policy?: { code?: string; label?: string } | null;
};

export type IdentityFacet = {
  matched: boolean;
  registry?: string | null;
  simulated?: boolean;
  nameMatch?: number | null;
  dobMatch?: boolean | null;
  genderMatch?: boolean | null;
};

export type ExposureFacet = {
  activeLoans: number; lenders: number; outstandingBand?: string | null; worstBucket?: string | null;
  newestDisbursement?: string | null; velocity14d?: number; partial?: boolean;
  screened?: number; queried?: number; responded?: number; silent?: unknown;
};

const dec = (n: unknown): Prisma.Decimal => new Prisma.Decimal(Number.isFinite(Number(n)) ? Number(n) : 0);
const decOrNull = (n: unknown): Prisma.Decimal | null =>
  n == null || !Number.isFinite(Number(n)) ? null : new Prisma.Decimal(Number(n));
const flt = (n: unknown, d = 0): number => (Number.isFinite(Number(n)) ? Number(n) : d);
const int = (n: unknown, d = 0): number => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : d);
const date = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Persist a pull and its facet in one transaction.
 *
 * It NEVER throws into the caller's path. A report that was successfully bought,
 * rendered and delivered has already done its job; failing the response because
 * a bookkeeping write went wrong would turn a working feature into an outage and
 * would bill the member for a document they never received. The failure is
 * returned instead, so the route can log it.
 */
export async function recordPull(a: RecordArgs): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const days = a.retentionDays ?? (await retentionDays(a.callerCode, a.reportType));
    const pulledAt = new Date();
    const expiresAt = new Date(pulledAt.getTime() + days * 86_400_000);

    const id = await prisma.$transaction(async (tx) => {
      const pull = await tx.reportPull.create({
        data: {
          subjectToken: a.subjectToken,
          callerId: a.callerId,
          callerCode: a.callerCode,
          reportType: a.reportType,
          bureauReports: a.bureauReports ?? [],
          consentRef: a.consentRef ?? null,
          source: a.source ?? PullSource.BUREAU,
          billedPulls: a.billedPulls ?? 0,
          latencyMs: a.latencyMs ?? null,
          logSeq: a.logSeq != null ? BigInt(a.logSeq) : null,
          logHash: a.logHash ?? null,
          trxIds: a.trxIds ?? [],
          wire: (a.wire ?? {}) as Prisma.InputJsonValue,
          normalised: (a.normalised ?? undefined) as Prisma.InputJsonValue | undefined,
          pulledAt,
          expiresAt,
        },
        select: { id: true },
      });

      if (a.facet?.kind === "credit") await writeCreditFacet(tx, pull.id, a.facet.file);
      if (a.facet?.kind === "cashflow") await writeCashflowFacet(tx, pull.id, a.facet.cashflow);
      if (a.facet?.kind === "identity") await writeIdentityFacet(tx, pull.id, a.facet.identity);
      if (a.facet?.kind === "exposure") await writeExposureFacet(tx, pull.id, a.facet.exposure);

      return pull.id;
    });

    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type Tx = Prisma.TransactionClient;

async function writeCreditFacet(tx: Tx, pullId: string, file: BureauFile) {
  const t = totals(file);
  await tx.reportCreditFile.create({
    data: {
      pullId,
      score: file.score?.value ?? null,
      scoreAsAt: date(file.score?.asAt),
      scoreBand: file.score?.category ?? null,
      ppiValue: file.ppi?.value ?? null,
      ppiRank: file.ppi?.rank ?? null,
      delinquencyCode: file.delinquency?.code ?? null,
      delinquencyLabel: file.delinquency?.label ?? null,
      accountsTotal: t.accounts,
      accountsLive: t.live,
      accountsClosed: t.closed,
      accountsAdverse: t.adverse,
      outstanding: dec(t.outstanding),
      overdue: dec(t.overdue),
      worstArrears: int(t.worstArrears),
      worstArrearsEver: int(t.worstArrearsEver),
      enquiries3: file.enquiries?.last3 ?? null,
      enquiries6: file.enquiries?.last6 ?? null,
      enquiries12: file.enquiries?.last12 ?? null,
      applications3: file.applications?.last3 ?? null,
      applications6: file.applications?.last6 ?? null,
      applications12: file.applications?.last12 ?? null,
      bouncedCheques12: file.bouncedCheques?.last12 ?? null,
      estimatedIncome: decOrNull(file.income?.estimatedAmount),
      hasFraud: file.hasFraud ?? null,
      isGuarantor: file.isGuarantor ?? null,
      freshestReportDays: t.freshestReportDays ?? null,
      stalestReportDays: t.stalestReportDays ?? null,
    },
  });

  if (file.accounts.length === 0) return;
  await tx.reportCreditLine.createMany({
    data: file.accounts.map((acc) => ({
      fileId: pullId,
      accountNumber: acc.accountNumber,
      // The lender's own name for the line, where the bureau gave one. The CBK
      // glossary resolves the institution elsewhere; an unresolved code is
      // stored as null rather than as its own raw form, so a later backfill can
      // tell "not looked up" from "looked up and not found".
      institution: null,
      product: acc.product || null,
      productTypeId: acc.productTypeId ?? null,
      status: acc.status,
      openedAt: date(acc.opened),
      loadedAt: date(acc.loadedAt),
      originalAmount: dec(acc.originalAmount),
      currentBalance: dec(acc.currentBalance),
      overdueBalance: dec(acc.overdueBalance),
      daysInArrears: int(acc.daysInArrears),
      highestDaysInArrears: int(acc.highestDaysInArrears),
      lastPaymentAmount: decOrNull(acc.lastPaymentAmount),
      lastPaymentDate: date(acc.lastPaymentDate),
      overdueDate: date(acc.overdueDate),
      delinquencyCode: acc.delinquencyCode ?? null,
      isOwn: acc.isYourAccount,
      isLive: acc.isLive,
      isOpenButSettled: acc.isOpenButSettled,
      isAdverse: acc.isAdverse,
    })),
  });
}

async function writeCashflowFacet(tx: Tx, pullId: string, c: CashflowFacet) {
  const f = c.features ?? {};
  await tx.reportCashflow.create({
    data: {
      pullId,
      periodStart: date(f.periodStart),
      periodEnd: date(f.periodEnd),
      monthsCovered: flt(f.monthsCovered),
      txnCount: int(f.txnCount),
      totalIncome: dec(f.totalIncome),
      avgMonthlyIncome: dec(f.avgMonthlyIncome),
      totalExpense: dec(f.totalExpense),
      avgMonthlyExpense: dec(f.avgMonthlyExpense),
      avgMonthlyNet: dec(f.avgMonthlyNet),
      incomeVolatility: flt(f.incomeVolatility),
      avgBalance: dec(f.avgBalance),
      minBalance: dec(f.minBalance),
      closingBalance: dec(f.closingBalance),
      balanceTrend: dec(f.balanceTrend),
      incomeMonthsRatio: flt(f.incomeMonthsRatio),
      businessInflowCount: int(f.businessInflowCount),
      tillPaybillCount: int(f.tillPaybillCount),
      gamblingOutflow: dec(f.gamblingOutflow),
      gamblingRatio: flt(f.gamblingRatio),
      loanInflow: dec(f.loanInflow),
      loanRepayOutflow: dec(f.loanRepayOutflow),
      loanEventCount: int(f.loanEventCount),
      loanDependencyRatio: flt(f.loanDependencyRatio),
      airtimeSpend: dec(f.airtimeSpend),
      score: c.affordability?.score != null ? int(c.affordability.score) : null,
      band: c.affordability?.band ?? null,
      recommendedMaxInstallment: decOrNull(c.affordability?.recommendedMaxInstallment),
      policyCode: c.policy?.code ?? null,
      policyLabel: c.policy?.label ?? null,
      reasons: (c.affordability?.reasons ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  if (!c.monthly?.length) return;
  await tx.reportCashflowMonth.createMany({
    data: c.monthly.map((m) => ({
      cashflowId: pullId,
      month: m.month,
      income: dec(m.income),
      expense: dec(m.expense),
      net: dec(m.net),
      gambling: dec(m.gambling),
    })),
    skipDuplicates: true,
  });
}

async function writeIdentityFacet(tx: Tx, pullId: string, i: IdentityFacet) {
  await tx.reportIdentity.create({
    data: {
      pullId,
      matched: Boolean(i.matched),
      registry: i.registry ?? null,
      simulated: Boolean(i.simulated),
      nameMatch: i.nameMatch ?? null,
      dobMatch: i.dobMatch ?? null,
      genderMatch: i.genderMatch ?? null,
    },
  });
}

async function writeExposureFacet(tx: Tx, pullId: string, e: ExposureFacet) {
  await tx.reportExposure.create({
    data: {
      pullId,
      activeLoans: int(e.activeLoans),
      lenders: int(e.lenders),
      outstandingBand: e.outstandingBand ?? null,
      worstBucket: e.worstBucket ?? null,
      newestDisbursement: date(e.newestDisbursement),
      velocity14d: int(e.velocity14d),
      partial: Boolean(e.partial),
      screened: int(e.screened),
      queried: int(e.queried),
      responded: int(e.responded),
      silent: (e.silent ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Clear the personal data behind every expired pull, keeping the receipt.
 *
 * Run from a cron. Deliberately NOT a delete: the spine is a billing and audit
 * record about a token, and destroying it would destroy a member's own proof of
 * what they were charged for. The facets and the wire are the personal data and
 * they go.
 */
export async function purgeExpired(now = new Date(), limit = 500): Promise<{ purged: number }> {
  const due = await prisma.reportPull.findMany({
    where: { expiresAt: { lte: now }, purgedAt: null },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (due.length === 0) return { purged: 0 };
  const ids = due.map((d) => d.id);

  await prisma.$transaction([
    prisma.reportCreditLine.deleteMany({ where: { fileId: { in: ids } } }),
    prisma.reportCreditFile.deleteMany({ where: { pullId: { in: ids } } }),
    prisma.reportCashflowMonth.deleteMany({ where: { cashflowId: { in: ids } } }),
    prisma.reportCashflow.deleteMany({ where: { pullId: { in: ids } } }),
    prisma.reportIdentity.deleteMany({ where: { pullId: { in: ids } } }),
    prisma.reportExposure.deleteMany({ where: { pullId: { in: ids } } }),
    prisma.reportPull.updateMany({
      where: { id: { in: ids } },
      data: { wire: {}, normalised: Prisma.DbNull, purgedAt: now },
    }),
  ]);
  return { purged: ids.length };
}
