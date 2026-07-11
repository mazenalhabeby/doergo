"use client"

// Standalone route — renders the shared Recurring panel full-page.
// The panel itself lives in ./recurring-view so this page file only has a
// default export (Next.js rejects extra named exports from a page.tsx).
import { RecurringPanel } from "./recurring-view"
import { PlanGate } from "@/components/plan-gate"

export default function RecurringRoutePage() {
  return (
    <PlanGate feature="recurring">
      <RecurringPanel />
    </PlanGate>
  )
}
