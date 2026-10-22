"use client"

import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { PAGE_SHELL } from "@/components/ui/page-width"

/** MemberProfilePage's module-level helpers, moved here unchanged so its sections can read them too. */
// Performance tab pulls in recharts — load it as its own chunk only when the tab
// is opened, so every other visitor doesn't pay for the chart lib (P11).
export const PerformanceTab = dynamic(
  () => import("./performance-tab").then((m) => m.PerformanceTab),
  { ssr: false },
)

// Same reasoning for the rest of the weight (audit MD-C1). The page opens on
// Overview, which renders none of these — the Access builder, the edit dialog, the
// audit trail and the Time Off tab were ~1,600 lines paid for on every visit.
export const AccessBuilder = dynamic(
  () => import("@/components/permissions/access-builder").then((m) => m.AccessBuilder),
  { ssr: false },
)

export const EditMemberDialog = dynamic(
  () => import("../../_components/edit-member-dialog").then((m) => m.EditMemberDialog),
  { ssr: false },
)

export const AuditTrail = dynamic(
  () => import("@/components/common/audit-trail").then((m) => m.AuditTrail),
  { ssr: false },
)

export const TimeOffTab = dynamic(
  () => import("./time-off-tab").then((m) => m.TimeOffTab),
  { ssr: false },
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Tasks tab page size (P3) — bounds the per-member task fetch + render.
export const TASKS_PAGE_SIZE = 20

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

// The page with nothing to show but a message (load failure, not found): the
// way back to the team, and the message centred under it.
export function MemberNotice({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("members.detail.backToTeam")}
        </Button>
        <div className="text-center py-20">
          {children}
        </div>
      </div>
    </div>
  )
}
