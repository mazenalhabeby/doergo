"use client"

import { lazy, Suspense } from "react"
import { PlanGate } from "@/components/plan-gate"
import { Skeleton } from "@/components/ui/skeleton"

// Loaded only when the section is opened: the log, its filters and pager stay out of /settings' first load.
const AuditLogSection = lazy(() => import("./audit-log-section").then((m) => ({ default: m.AuditLogSection })))

function LazyFallback() {
  return (
    <div className="space-y-4 p-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export function LazyAuditLog() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <PlanGate feature="audit_log">
        <AuditLogSection />
      </PlanGate>
    </Suspense>
  )
}
