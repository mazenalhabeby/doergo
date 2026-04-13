-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "task_events_taskId_createdAt_idx" ON "task_events"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_assignedToId_status_idx" ON "tasks"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "time_entries_userId_status_idx" ON "time_entries"("userId", "status");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_clockInAt_idx" ON "time_entries"("organizationId", "clockInAt");

-- CreateIndex
CREATE INDEX "users_organizationId_role_isActive_idx" ON "users"("organizationId", "role", "isActive");
