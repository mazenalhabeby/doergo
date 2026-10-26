import React from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, Clock, XCircle, StickyNote, Pencil, type LucideIcon } from "lucide-react"
import { format, parseISO } from "date-fns"
import { formatTimeOfDay } from "@/lib/utils"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { personName, countryFromTz, approvalText } from "@hbcfield/shared/client"
import { EditHistoryDialog } from "./edit-history-dialog"
import { StatTile } from "@/components/ui/stat-tile"
import { deriveAttendanceFlags } from "@/lib/attendance-status"
import { LabelChip } from "@/components/attendance/attendance-label-chip"
import { useTimeFormat } from "@/hooks/use-time-format"
import { WARN_SOFT } from "./time-styles"

/** An entry's labels — the one catalogue's words, order and colours, with each reason on hover. */
function FlagReasonBadges({ entry }: { entry: TimeEntry }) {
  const reader = useTimeFormat()
  const chips = deriveAttendanceFlags(entry, reader)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <LabelChip key={chip.key} chip={chip} />
      ))}
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
        soft
      />
      <div>
        <p className="font-medium text-foreground">{personName(entry.user)}</p>
        <p className="text-xs text-muted-foreground">{entry.location?.name || t("attendance.unknownLocation")}</p>
      </div>
    </div>
  )
}

/**
 * Short date ("Aug 11") in the ENTRY's own timezone — must match the time cell,
 * which also renders in the entry zone. Formatting the date in the viewer's
 * browser zone (the old `format(toDate(at), …)`) rolled it to the next day for a
 * clock-in whose UTC instant crosses midnight in the browser zone (e.g. 6:08 PM
 * EDT = 00:08 next-day in Berlin), so the date and time disagreed.
 */
export function formatDateInZone(at: string, tz?: string | null, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      timeZone: tz || undefined,
      month: "short",
      day: "numeric",
    }).format(toDate(at))
  } catch {
    return format(toDate(at), "MMM d")
  }
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
        {formatDateInZone(at, tz, locale)}
        {country ? ` / ${country}` : ""}
      </p>
    </div>
  )
}

/** Approval cell: approval-state badge with any smart-flag badges beneath. */
export function ApprovalCell({ entry }: { entry: TimeEntry }) {
  const { locale } = useTimeFormat()
  // Where the entry stands with a person — the same words as the member page (shared catalogue).
  const word = approvalText({ approvalStatus: entry.approvalStatus }, locale)
  return (
    <div className="space-y-1">
      {entry.approvalStatus === "AUTO" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-shell-accent">
          <CheckCircle2 className="size-3.5" />
          {word}
        </span>
      ) : entry.approvalStatus === "APPROVED" ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-shell-accent">
          <CheckCircle2 className="size-3.5" />
          {word}
        </span>
      ) : entry.approvalStatus === "REJECTED" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-shell-crit">
          <XCircle className="size-3.5" />
          {word}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-shell-warn">
          <Clock className="size-3.5" />
          {word}
        </span>
      )}
      <FlagReasonBadges entry={entry} />
      <EditedBadge entry={entry} />
    </div>
  )
}

/**
 * "Edited" badge — flags a manually-adjusted entry so an admin knows the times
 * aren't the raw clock in/out. Hovering reveals who edited it, when, the
 * original → new times, and the reason (all already on the entry). Renders
 * nothing for untouched entries.
 */
function EditedBadge({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation()
  const [historyOpen, setHistoryOpen] = React.useState(false)
  if (!entry.isEdited) return null

  const editor = entry.editedBy ? personName(entry.editedBy) : null

  return (
    <>
      {/* Click opens the full history table. Kept a plain button (not nested in a
          HoverCard) so the click reliably fires and the dialog isn't swallowed by
          the hovercard's pointer/focus handling. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setHistoryOpen(true)
        }}
        title={editor ? t("attendance.edited.by", { name: editor, defaultValue: `Edited by ${editor}` }) : undefined}
        className={
          "inline-flex h-5 w-fit cursor-pointer items-center gap-1 rounded-full px-2 text-[11px] font-semibold " +
          `${WARN_SOFT} transition hover:brightness-95`
        }
      >
        <Pencil className="size-2.5" />
        {t("attendance.edited.badge", "Edited")}
      </button>
      <EditHistoryDialog entry={entry} open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  )
}

/** Stat card used across the attendance tabs — the shared StatTile; the colour is the icon's. */
const STAT_CARD_TONE = { blue: "primary", green: "success", amber: "warning", slate: "neutral" } as const

export function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string
  value: string | number
  icon: LucideIcon
  color: keyof typeof STAT_CARD_TONE
}) {
  return <StatTile label={title} value={value} icon={icon} iconTone={STAT_CARD_TONE[color]} />
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
          className={
            "block truncate text-left text-sm text-muted-foreground underline " +
            "decoration-dotted decoration-muted-foreground/40 underline-offset-4 " +
            "transition-colors hover:text-foreground cursor-help"
          }
        >
          {note}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 max-h-64 overflow-y-auto">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <StickyNote className="size-3.5 text-shell-accent" />
          {t("attendance.notes")}
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{note}</p>
      </HoverCardContent>
    </HoverCard>
  )
}
