"use client"

import { ShiftRecurrence } from "@hbcfield/shared/client"

/** Parts moved here unchanged from rota-tab-helpers.tsx (line length pass). */
// Semantic accent per recurrence type (light + dark tokens, no raw hex).
export const RECURRENCE_BADGE: Record<ShiftRecurrence, string> = {
  [ShiftRecurrence.DAILY]:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  [ShiftRecurrence.WEEKLY]:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  [ShiftRecurrence.MONTHLY]:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  [ShiftRecurrence.ONE_OFF]:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
}
