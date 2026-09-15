"use client"

import { useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { type TimeEntry } from "@/lib/api"
import { mayOfferOvertime, overtimeActionEnabled, type OvertimeViewer } from "@/lib/overtime-preview"

/**
 * "Add overtime" on a closed shift — whether to offer it, for everybody who offers it.
 *
 * The attendance board and a member's attendance tab both render the action.
 * The rule itself is pure and lives in `lib/overtime-preview.ts`; this only
 * reads the viewer off the session, so neither screen re-derives the gate.
 *
 * A COURTESY, not a boundary: the route is `@RequirePlan('shift_scheduling')`
 * and task-service checks `canApproveOvertime` against the entry's own space and
 * refuses self-approval. A wrong answer here only shows or hides a button.
 */
export function useOvertimeAction(): {
  /** Offered anywhere at all — decides whether a table needs an actions column. */
  enabled: boolean
  /** Offered on this row. */
  canOfferFor: (entry: TimeEntry) => boolean
  viewer: OvertimeViewer
} {
  const { user, hasPermission, hasPlanFeature } = useAuth()
  const viewer: OvertimeViewer = {
    userId: user?.id,
    canApprove: hasPermission("canApproveOvertime"),
    hasOption: hasPlanFeature("shift_scheduling"),
  }
  const { userId, canApprove, hasOption } = viewer
  const canOfferFor = useCallback(
    (entry: TimeEntry) => mayOfferOvertime(entry, { userId, canApprove, hasOption }),
    [userId, canApprove, hasOption],
  )
  return { enabled: overtimeActionEnabled(viewer), canOfferFor, viewer }
}
