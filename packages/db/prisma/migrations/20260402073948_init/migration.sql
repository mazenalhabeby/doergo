-- CreateIndex
CREATE INDEX "invitations_organizationId_status_idx" ON "invitations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "join_requests_reviewedById_idx" ON "join_requests"("reviewedById");

-- CreateIndex
CREATE INDEX "service_reports_completedById_idx" ON "service_reports"("completedById");

-- CreateIndex
CREATE INDEX "service_reports_organizationId_completedAt_idx" ON "service_reports"("organizationId", "completedAt");

-- CreateIndex
CREATE INDEX "tasks_organizationId_status_idx" ON "tasks"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tasks_organizationId_status_createdAt_idx" ON "tasks"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "time_off_requests_approvedById_idx" ON "time_off_requests"("approvedById");
