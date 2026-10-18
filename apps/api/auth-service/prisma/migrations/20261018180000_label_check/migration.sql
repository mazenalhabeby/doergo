-- The nightly label check (docs/plans/clock-attendance-2026-10.md step 4). Additive only: two new
-- tables, nothing existing is read differently or rewritten.
CREATE TABLE "label_check_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "mismatches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "label_check_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "label_check_runs_organizationId_localDate_key" ON "label_check_runs"("organizationId", "localDate");

CREATE TABLE "label_check_findings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "label_check_findings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "label_check_findings_entryId_localDate_key" ON "label_check_findings"("entryId", "localDate");
CREATE INDEX "label_check_findings_organizationId_createdAt_idx" ON "label_check_findings"("organizationId", "createdAt");
