-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PROSPECT', 'SHADOW', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('QUERY', 'REPORT');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('PWA', 'LMS_CONSOLE', 'MEMBER_API', 'FIELD_OFFICER');

-- CreateEnum
CREATE TYPE "ConsentEventKind" AS ENUM ('CAPTURED', 'VALIDATED', 'REFUSED_SCOPE', 'REFUSED_REVOKED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('GRANTED', 'REFUSED_NO_CONSENT', 'REFUSED_SCOPE', 'REFUSED_RECIPROCITY', 'REFUSED_QUOTA', 'ERROR');

-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('SUPER_ADMIN', 'MEMBER_ADMIN', 'ANALYST', 'AUDITOR');

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PullSource" AS ENUM ('BUREAU', 'STORED', 'REPLAY', 'DERIVED');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'PROSPECT',
    "joinedAt" TIMESTAMP(3),
    "shadowUntil" TIMESTAMP(3),
    "publicKey" TEXT,
    "keyRegisteredAt" TIMESTAMP(3),
    "sourceHost" TEXT,
    "sourceDatabase" TEXT,
    "sourceEntityId" INTEGER,
    "lastContributionAt" TIMESTAMP(3),
    "borrowers" INTEGER NOT NULL DEFAULT 0,
    "loans" INTEGER NOT NULL DEFAULT 0,
    "holdingGeneration" INTEGER NOT NULL DEFAULT 0,
    "holdingsPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "reportType" INTEGER,
    "description" TEXT NOT NULL,
    "requiredScopes" TEXT[],
    "live" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "freeTierPerDay" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "scopes" TEXT[],
    "wordingVersion" TEXT NOT NULL,
    "capturedVia" "ConsentChannel" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "evidence" JSONB,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "kind" "ConsentEventKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorMemberId" TEXT,
    "serviceCode" TEXT,
    "detail" TEXT,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "consentRef" TEXT,
    "outcome" "CallOutcome" NOT NULL,
    "latencyMs" INTEGER,
    "respondents" INTEGER,
    "detail" TEXT,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLogEntry" (
    "seq" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "callerCode" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "consentRef" TEXT,
    "outcome" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "responseDigest" TEXT,
    "callerSignature" TEXT,
    "timestampedAt" TIMESTAMP(3),
    "timestampBatchId" TEXT,

    CONSTRAINT "MessageLogEntry_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "OprfIssuance" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL DEFAULT 'SERVING',

    CONSTRAINT "OprfIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberHolding" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "activeLoans" INTEGER NOT NULL DEFAULT 0,
    "outstandingKes" INTEGER NOT NULL DEFAULT 0,
    "worstBucket" TEXT NOT NULL DEFAULT 'due',
    "newestDisbursedAt" TIMESTAMP(3),
    "generation" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFilter" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "bits" BYTEA NOT NULL,
    "k" INTEGER NOT NULL,
    "m" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "amountKes" INTEGER,
    "daysPastDue" INTEGER,

    CONSTRAINT "LedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberId" TEXT NOT NULL,
    "subjectToken" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "amountKes" INTEGER,
    "features" JSONB NOT NULL,
    "featureSetVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "score" INTEGER,
    "label" TEXT,
    "labelledAt" TIMESTAMP(3),
    "labelSource" TEXT,
    "labelMemberCode" TEXT,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureSetVersion" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CHALLENGER',
    "trainedOnRows" INTEGER NOT NULL,
    "trainStart" TIMESTAMP(3) NOT NULL,
    "trainEnd" TIMESTAMP(3) NOT NULL,
    "testStart" TIMESTAMP(3) NOT NULL,
    "testEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowScore" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberApplication" (
    "id" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "sourceHost" TEXT,
    "sourceDatabase" TEXT,
    "sourceEntityId" INTEGER,
    "claimedBorrowers" INTEGER NOT NULL DEFAULT 0,
    "claimedLoans" INTEGER NOT NULL DEFAULT 0,
    "publicKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "memberId" TEXT,

    CONSTRAINT "MemberApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceAction" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "memberCode" TEXT,
    "applicationId" TEXT,
    "decidedBy" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "GovernanceAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "OperatorRole" NOT NULL DEFAULT 'ANALYST',
    "memberId" TEXT,
    "codeHash" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "rights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAudit" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,

    CONSTRAINT "OperatorAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPolicy" (
    "id" TEXT NOT NULL,
    "memberCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPull" (
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
CREATE TABLE "ReportCreditFile" (
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
CREATE TABLE "ReportCreditLine" (
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
CREATE TABLE "ReportCashflow" (
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
CREATE TABLE "ReportCashflowMonth" (
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
CREATE TABLE "ReportIdentity" (
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
CREATE TABLE "ReportExposure" (
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
CREATE UNIQUE INDEX "Member_code_key" ON "Member"("code");

-- CreateIndex
CREATE INDEX "Member_status_idx" ON "Member"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Member_sourceHost_sourceDatabase_sourceEntityId_key" ON "Member"("sourceHost", "sourceDatabase", "sourceEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE INDEX "Service_kind_idx" ON "Service"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_memberId_serviceId_key" ON "Subscription"("memberId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_ref_key" ON "Consent"("ref");

-- CreateIndex
CREATE INDEX "Consent_subjectToken_idx" ON "Consent"("subjectToken");

-- CreateIndex
CREATE INDEX "Consent_memberId_idx" ON "Consent"("memberId");

-- CreateIndex
CREATE INDEX "Consent_expiresAt_idx" ON "Consent"("expiresAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_consentId_at_idx" ON "ConsentEvent"("consentId", "at");

-- CreateIndex
CREATE INDEX "AuditEntry_subjectToken_idx" ON "AuditEntry"("subjectToken");

-- CreateIndex
CREATE INDEX "AuditEntry_at_idx" ON "AuditEntry"("at");

-- CreateIndex
CREATE INDEX "AuditEntry_callerId_at_idx" ON "AuditEntry"("callerId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MessageLogEntry_hash_key" ON "MessageLogEntry"("hash");

-- CreateIndex
CREATE INDEX "MessageLogEntry_at_idx" ON "MessageLogEntry"("at");

-- CreateIndex
CREATE INDEX "MessageLogEntry_callerCode_at_idx" ON "MessageLogEntry"("callerCode", "at");

-- CreateIndex
CREATE INDEX "MessageLogEntry_subjectToken_idx" ON "MessageLogEntry"("subjectToken");

-- CreateIndex
CREATE INDEX "MessageLogEntry_timestampedAt_idx" ON "MessageLogEntry"("timestampedAt");

-- CreateIndex
CREATE INDEX "OprfIssuance_memberId_at_idx" ON "OprfIssuance"("memberId", "at");

-- CreateIndex
CREATE INDEX "MemberHolding_subjectToken_idx" ON "MemberHolding"("subjectToken");

-- CreateIndex
CREATE INDEX "MemberHolding_memberId_generation_idx" ON "MemberHolding"("memberId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "MemberHolding_memberId_subjectToken_generation_key" ON "MemberHolding"("memberId", "subjectToken", "generation");

-- CreateIndex
CREATE INDEX "MemberFilter_memberId_builtAt_idx" ON "MemberFilter"("memberId", "builtAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFilter_memberId_generation_key" ON "MemberFilter"("memberId", "generation");

-- CreateIndex
CREATE INDEX "LedgerEvent_subjectToken_recordedAt_idx" ON "LedgerEvent"("subjectToken", "recordedAt");

-- CreateIndex
CREATE INDEX "LedgerEvent_subjectToken_at_idx" ON "LedgerEvent"("subjectToken", "at");

-- CreateIndex
CREATE INDEX "LedgerEvent_memberId_recordedAt_idx" ON "LedgerEvent"("memberId", "recordedAt");

-- CreateIndex
CREATE INDEX "Decision_memberId_at_idx" ON "Decision"("memberId", "at");

-- CreateIndex
CREATE INDEX "Decision_subjectToken_idx" ON "Decision"("subjectToken");

-- CreateIndex
CREATE INDEX "Decision_label_idx" ON "Decision"("label");

-- CreateIndex
CREATE INDEX "Decision_outcome_label_idx" ON "Decision"("outcome", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_version_key" ON "ModelVersion"("version");

-- CreateIndex
CREATE INDEX "ModelVersion_status_idx" ON "ModelVersion"("status");

-- CreateIndex
CREATE INDEX "ShadowScore_modelVersionId_idx" ON "ShadowScore"("modelVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowScore_decisionId_modelVersionId_key" ON "ShadowScore"("decisionId", "modelVersionId");

-- CreateIndex
CREATE INDEX "MemberApplication_status_submittedAt_idx" ON "MemberApplication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "GovernanceAction_at_idx" ON "GovernanceAction"("at");

-- CreateIndex
CREATE INDEX "GovernanceAction_memberCode_idx" ON "GovernanceAction"("memberCode");

-- CreateIndex
CREATE INDEX "Operator_status_idx" ON "Operator"("status");

-- CreateIndex
CREATE INDEX "Operator_memberId_idx" ON "Operator"("memberId");

-- CreateIndex
CREATE INDEX "OperatorAudit_at_idx" ON "OperatorAudit"("at");

-- CreateIndex
CREATE INDEX "OperatorAudit_operatorId_at_idx" ON "OperatorAudit"("operatorId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPolicy_memberCode_key" ON "MemberPolicy"("memberCode");

-- CreateIndex
CREATE INDEX "ReportPull_subjectToken_reportType_pulledAt_idx" ON "ReportPull"("subjectToken", "reportType", "pulledAt");

-- CreateIndex
CREATE INDEX "ReportPull_callerId_pulledAt_idx" ON "ReportPull"("callerId", "pulledAt");

-- CreateIndex
CREATE INDEX "ReportPull_expiresAt_idx" ON "ReportPull"("expiresAt");

-- CreateIndex
CREATE INDEX "ReportPull_logSeq_idx" ON "ReportPull"("logSeq");

-- CreateIndex
CREATE INDEX "ReportCreditLine_fileId_idx" ON "ReportCreditLine"("fileId");

-- CreateIndex
CREATE INDEX "ReportCreditLine_institution_idx" ON "ReportCreditLine"("institution");

-- CreateIndex
CREATE INDEX "ReportCashflowMonth_cashflowId_idx" ON "ReportCashflowMonth"("cashflowId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCashflowMonth_cashflowId_month_key" ON "ReportCashflowMonth"("cashflowId", "month");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowScore" ADD CONSTRAINT "ShadowScore_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPull" ADD CONSTRAINT "ReportPull_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCreditFile" ADD CONSTRAINT "ReportCreditFile_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCreditLine" ADD CONSTRAINT "ReportCreditLine_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ReportCreditFile"("pullId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCashflow" ADD CONSTRAINT "ReportCashflow_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCashflowMonth" ADD CONSTRAINT "ReportCashflowMonth_cashflowId_fkey" FOREIGN KEY ("cashflowId") REFERENCES "ReportCashflow"("pullId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportIdentity" ADD CONSTRAINT "ReportIdentity_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExposure" ADD CONSTRAINT "ReportExposure_pullId_fkey" FOREIGN KEY ("pullId") REFERENCES "ReportPull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

