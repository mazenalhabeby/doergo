import React from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
export {
  toDate,
  formatTime,
  WorkerCell,
  formatDateInZone,
  ClockCell,
  ApprovalCell,
  StatCard,
  NoteCell,
} from "./stat-card"

// ── Shared attendance-row cells (used by BOTH the Tracking and Approvals tables
// so the two views render identically) ──────────────────────────────────────

/** Clock-status pill: Active / Completed / Auto. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const config = {
    CLOCKED_IN: {
      label: t("attendance.status.active"),
      icon: CheckCircle2,
      className: "bg-green-500/10 text-green-700 border-green-200",
    },
    CLOCKED_OUT: {
      label: t("attendance.status.completed"),
      icon: Clock,
      className: "bg-muted text-foreground border-border",
    },
    AUTO_OUT: {
      label: t("attendance.status.auto"),
      icon: AlertCircle,
      className: "bg-amber-500/10 text-amber-700 border-amber-200",
    },
  }[status] || {
    label: status,
    icon: Clock,
    className: "bg-muted text-foreground border-border",
  }
  const Icon = config.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
        config.className,
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  )
}
