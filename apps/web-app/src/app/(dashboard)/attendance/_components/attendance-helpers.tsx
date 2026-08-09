import React from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, CheckCircle2, Clock, XCircle, StickyNote, type LucideIcon } from "lucide-react"
import { format, parseISO } from "date-fns"
import { cn, formatTimeOfDay } from "@/lib/utils"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { countryFromTz } from "@hbcfield/shared/client"

// Flag reason badge config for smart auto-approval.
const FLAG_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  OVERTIME: { label: "Overtime", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  MISSED_CLOCK_OUT: { label: "Missed Clock-Out", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  OUTSIDE_GEOFENCE_IN: { label: "Geofence (In)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  OUTSIDE_GEOFENCE_OUT: { label: "Geofence (Out)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  LATE_ARRIVAL: { label: "Late Arrival", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  EARLY_DEPARTURE: { label: "Early Departure", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  UNSCHEDULED_DAY: { label: "Unscheduled", className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
}

export function FlagReasonBadges({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const config = FLAG_BADGE_CONFIG[reason] || { label: reason, className: "bg-muted text-muted-foreground border-border" }
        return (
          <span
            key={reason}
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border",
              config.className,
            )}
          >
            {config.label}
          </span>
        )
      })}
    </div>
  )
}

/** Parse a date input (handles both Date objects and ISO strings). */
export function toDate(dateInput: Date | string): Date {
  return dateInput instanceof Date ? dateInput : parseISO(dateInput)
}

/**
 * Format a time honoring the user's 12h/24h preference, or "-" when null.
 * Pass `hour12` and `locale` from the `useTimeFormat()` hook.
 *
 * `timeZone` is the entry's OWN location timezone — attendance times must render
 * in the zone WHERE they were clocked (not the viewer's browser zone). When set,
 * the formatter appends a city label (e.g. "6:00 AM · New York"). Pass the org tz
 * (or omit) only when the location zone is genuinely unavailable.
 */
export function formatTime(
  dateInput: Date | string | null,
  hour12 = false,
  locale?: string,
  timeZone?: string | null,
): string {
  if (!dateInput) return "-"
  return formatTimeOfDay(dateInput, hour12, locale, timeZone)
}

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

/** Worker cell: avatar + name with the location name beneath. */
export function WorkerCell({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <UserAvatar
        firstName={entry.user?.firstName}
        lastName={entry.user?.lastName}
        seed={entry.user?.id}
        size="md"
      />
      <div>
        <p className="font-medium text-foreground">
          {entry.user?.firstName} {entry.user?.lastName}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.location?.name || t("attendance.unknownLocation")}
        </p>
      </div>
    </div>
  )
}

/** Clock-in / clock-out cell: time (in the entry zone) with date + country beneath, or "-". */
export function ClockCell({
  at,
  tz,
  hour12,
  locale,
}: {
  at?: string | null
  tz?: string | null
  hour12: boolean
  locale?: string
}) {
  if (!at) return <span className="text-muted-foreground">-</span>
  const country = countryFromTz(tz, locale)
  return (
    <div>
      <p className="font-medium text-foreground">{formatTime(at, hour12, locale, tz)}</p>
      <p className="text-xs text-muted-foreground">
        {format(toDate(at), "MMM d")}
        {country ? ` / ${country}` : ""}
      </p>
    </div>
  )
}

/** Approval cell: approval-state badge with any smart-flag badges beneath. */
export function ApprovalCell({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      {entry.approvalStatus === "AUTO" ? (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
          <CheckCircle2 className="size-3.5" />
          {t("attendance.tracking.autoApproved")}
        </span>
      ) : entry.approvalStatus === "APPROVED" ? (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
          <CheckCircle2 className="size-3.5" />
          {t("common.approved")}
        </span>
      ) : entry.approvalStatus === "REJECTED" ? (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
          <XCircle className="size-3.5" />
          {t("common.rejected")}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
          <Clock className="size-3.5" />
          {t("common.pending")}
        </span>
      )}
      <FlagReasonBadges reasons={entry.flagReasons} />
    </div>
  )
}

/** Stat card used across the attendance tabs. */
export function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  icon: LucideIcon
  color: "blue" | "green" | "amber" | "slate"
}) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    slate: "bg-muted text-muted-foreground",
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-4">
        <div className={cn("p-3 rounded-xl", colorClasses[color])}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Notes cell for attendance tables. Keeps the row compact — a single truncated
 * line with a subtle dotted underline hinting there's more — and reveals the FULL
 * note in an elegant HoverCard on hover/focus (scrolls if very long). No layout
 * shift, no row growth: the table stays intact while long notes stay readable.
 */
export function NoteCell({ note, maxWidth = 180 }: { note?: string | null; maxWidth?: number }) {
  const { t } = useTranslation()
  if (!note || !note.trim()) return <span className="text-muted-foreground">-</span>
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          style={{ maxWidth }}
          className="block truncate text-left text-sm text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground cursor-help"
        >
          {note}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 max-h-64 overflow-y-auto">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <StickyNote className="size-3.5 text-brand-600" />
          {t("attendance.notes")}
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{note}</p>
      </HoverCardContent>
    </HoverCard>
  )
}
