"use client"

import { PlanGate } from "@/components/plan-gate"

import { AuditLogPageInner } from "./audit-log-page-inner"

export default function AuditLogPage() {
  return (
    <PlanGate feature="audit_log">
      <AuditLogPageInner />
    </PlanGate>
  )
}
