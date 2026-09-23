-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-24 · The report store.
--
-- Written by hand rather than left to `prisma db push`, for the same reason as
-- the migration beside it: this runs against the live Registry, which holds real
-- members and their registered public keys, and a plan should be reviewable
-- rather than inferred.
--
-- WHAT THIS ENABLES
--
--   A pull is kept. Until now the Registry routed a bureau call, rendered the
--   answer, streamed it and forgot it — so the second officer to open the same
--   customer that afternoon bought the same bytes again, and an affordability
--   read assembled from a crunched statement could be looked at exactly once.
--
--   ReportPull is the spine: one row per pull of any type, holding the receipt
--   (who asked, under which consent, what it cost, which log entry proves it)
--   and the VERBATIM wire answer. Four optional facets hang off it, flattening
--   the data points people actually query into columns — the credit file and
--   its account lines, the cashflow features and their monthly series, an
--   identity result, an exposure aggregate.
--
--   It is NOT one table per bureau report number. The numbers are Metropol's,
--   four of the published types have no bureau behind them at all, and report 12
--   is already a composite of four others — see the long note in schema.prisma.
--
-- WHAT IS NOT IN HERE
--   No national ID, no name, no phone. The subject is `subjectToken` and nothing
--   else, exactly as in Consent and AuditEntry. No rendered PDF: it is
--   deterministic from the wire payload, and storing one per pull would multiply
--   this table by fifty to save a second.
--
-- SAFETY
--   · No table is dropped, altered or renamed. Every statement is a CREATE.
--   · Every statement is guarded, so a half-applied run is safe to repeat.
--   · Nothing reads these tables until lib/reports/store.ts is deployed, so the
--     schema may land ahead of the code.
--
-- RETENTION
--   `expiresAt` is written at pull time from the member's policy (default 30
--   days, MemberPolicy.settings.retention). `purgeExpired()` then clears the
--   wire and the facets and keeps the spine: the receipt is evidence about a
--   token, and evidence does not get shorter because a setting changed.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
-- Postgres has no CREATE TYPE IF NOT EXISTS, and a bare CREATE TYPE makes this
-- whole file non-repeatable — which matters because it is applied by hand.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PullSource') THEN
    CREATE TYPE "PullSource" AS ENUM ('BUREAU', 'STORED', 'REPLAY', 'DERIVED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportPull" (
    "id" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "callerCode" TEXT NOT NULL,
    "reportType" INTEGER NOT NULL,
    "bureauReports" INTEGER[],
    "consentRef" TEXT,
    "source" "PullSource" NOT NULL DEFAULT 'BUREAU',
    "billedPulls" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "logSeq" BIGINT,
    "logHash" TEXT,
    "wire" JSONB NOT NULL,
    "normalised" JSONB,
    "trxIds" TEXT[],
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "ReportPull_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportCreditFile" (
    "pullId" TEXT NOT NULL,
    "score" INTEGER,
    "scoreAsAt" TIMESTAMP(3),
    "scoreBand" TEXT,
    "ppiValue" DOUBLE PRECISION,
    "ppiRank" TEXT,
    "delinquencyCode" TEXT,
    "delinquencyLabel" TEXT,
    "accountsTotal" INTEGER NOT NULL DEFAULT 0,
    "accountsLive" INTEGER NOT NULL DEFAULT 0,
    "accountsClosed" INTEGER NOT NULL DEFAULT 0,
    "accountsAdverse" INTEGER NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "worstArrears" INTEGER NOT NULL DEFAULT 0,
    "worstArrearsEver" INTEGER NOT NULL DEFAULT 0,
    "enquiries3" INTEGER,
    "enquiries6" INTEGER,
    "enquiries12" INTEGER,
    "applications3" INTEGER,
    "applications6" INTEGER,
    "applications12" INTEGER,
    "bouncedCheques12" INTEGER,
    "estimatedIncome" DECIMAL(18,2),
    "hasFraud" BOOLEAN,
    "isGuarantor" BOOLEAN,
    "freshestReportDays" INTEGER,
    "stalestReportDays" INTEGER,

    CONSTRAINT "ReportCreditFile_pkey" PRIMARY KEY ("pullId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportCreditLine" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "institution" TEXT,
    "product" TEXT,
    "productTypeId" INTEGER,
    "status" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "loadedAt" TIMESTAMP(3),
    "originalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdueBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "daysInArrears" INTEGER NOT NULL DEFAULT 0,
    "highestDaysInArrears" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentAmount" DECIMAL(18,2),
    "lastPaymentDate" TIMESTAMP(3),
    "overdueDate" TIMESTAMP(3),
    "delinquencyCode" TEXT,
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "isOpenButSettled" BOOLEAN NOT NULL DEFAULT false,
    "isAdverse" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReportCreditLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportCashflow" (
    "pullId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "monthsCovered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txnCount" INTEGER NOT NULL DEFAULT 0,
    "totalIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "avgMonthlyIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalExpense" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "avgMonthlyExpense" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "avgMonthlyNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "incomeVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceTrend" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "incomeMonthsRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "businessInflowCount" INTEGER NOT NULL DEFAULT 0,
    "tillPaybillCount" INTEGER NOT NULL DEFAULT 0,
    "gamblingOutflow" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gamblingRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanInflow" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanRepayOutflow" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanEventCount" INTEGER NOT NULL DEFAULT 0,
    "loanDependencyRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airtimeSpend" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "score" INTEGER,
    "band" TEXT,
    "recommendedMaxInstallment" DECIMAL(18,2),
    "policyCode" TEXT,
    "policyLabel" TEXT,
    "reasons" JSONB,

    CONSTRAINT "ReportCashflow_pkey" PRIMARY KEY ("pullId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportCashflowMonth" (
    "id" TEXT NOT NULL,
    "cashflowId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "income" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expense" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gambling" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ReportCashflowMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportIdentity" (
    "pullId" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "registry" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "nameMatch" DOUBLE PRECISION,
    "dobMatch" BOOLEAN,
    "genderMatch" BOOLEAN,

    CONSTRAINT "ReportIdentity_pkey" PRIMARY KEY ("pullId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportExposure" (
    "pullId" TEXT NOT NULL,
    "activeLoans" INTEGER NOT NULL DEFAULT 0,
    "lenders" INTEGER NOT NULL DEFAULT 0,
    "outstandingBand" TEXT,
    "worstBucket" TEXT,
    "newestDisbursement" TIMESTAMP(3),
    "velocity14d" INTEGER NOT NULL DEFAULT 0,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "screened" INTEGER NOT NULL DEFAULT 0,
    "queried" INTEGER NOT NULL DEFAULT 0,
    "responded" INTEGER NOT NULL DEFAULT 0,
    "silent" JSONB,

    CONSTRAINT "ReportExposure_pkey" PRIMARY KEY ("pullId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportPull_subjectToken_reportType_pulledAt_idx" ON "ReportPull"("subjectToken", "reportType", "pulledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportPull_callerId_pulledAt_idx" ON "ReportPull"("callerId", "pulledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportPull_expiresAt_idx" ON "ReportPull"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportPull_logSeq_idx" ON "ReportPull"("logSeq");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportCreditLine_fileId_idx" ON "ReportCreditLine"("fileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportCreditLine_institution_idx" ON "ReportCreditLine"("institution");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportCashflowMonth_cashflowId_idx" ON "ReportCashflowMonth"("cashflowId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReportCashflowMonth_cashflowId_month_key" ON "ReportCashflowMonth"("cashflowId", "month");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportPull_callerId_fkey') THEN
    ALTER TABLE "ReportPull" ADD CONSTRAINT "ReportPull_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCreditFile_pullId_fkey') THEN
    ALTER TABLE "ReportCreditFile" ADD CONSTRAINT "ReportCreditFile_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCreditLine_fileId_fkey') THEN
    ALTER TABLE "ReportCreditLine" ADD CONSTRAINT "ReportCreditLine_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ReportCreditFile"("pullId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCashflow_pullId_fkey') THEN
    ALTER TABLE "ReportCashflow" ADD CONSTRAINT "ReportCashflow_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCashflowMonth_cashflowId_fkey') THEN
    ALTER TABLE "ReportCashflowMonth" ADD CONSTRAINT "ReportCashflowMonth_cashflowId_fkey" FOREIGN KEY ("cashflowId") REFERENCES "ReportCashflow"("pullId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportIdentity_pullId_fkey') THEN
    ALTER TABLE "ReportIdentity" ADD CONSTRAINT "ReportIdentity_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportExposure_pullId_fkey') THEN
    ALTER TABLE "ReportExposure" ADD CONSTRAINT "ReportExposure_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
