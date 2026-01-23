-- CreateEnum
CREATE TYPE "ReportAttachmentType" AS ENUM ('BEFORE', 'AFTER');

-- CreateTable
CREATE TABLE "service_reports" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "assetId" TEXT,
    "summary" TEXT NOT NULL,
    "workPerformed" TEXT,
    "workDuration" INTEGER NOT NULL,
    "technicianSignature" TEXT,
    "customerSignature" TEXT,
    "customerName" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "completedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" "ReportAttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_used" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parts_used_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_reports_taskId_key" ON "service_reports"("taskId");

-- CreateIndex
CREATE INDEX "service_reports_taskId_idx" ON "service_reports"("taskId");

-- CreateIndex
CREATE INDEX "service_reports_assetId_idx" ON "service_reports"("assetId");

-- CreateIndex
CREATE INDEX "service_reports_completedAt_idx" ON "service_reports"("completedAt");

-- CreateIndex
CREATE INDEX "service_reports_organizationId_idx" ON "service_reports"("organizationId");

-- CreateIndex
CREATE INDEX "report_attachments_reportId_idx" ON "report_attachments"("reportId");

-- CreateIndex
CREATE INDEX "parts_used_reportId_idx" ON "parts_used"("reportId");

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts_used" ADD CONSTRAINT "parts_used_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
