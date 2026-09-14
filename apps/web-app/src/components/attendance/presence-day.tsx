"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { MapPin } from "lucide-react"

import { attendanceApi } from "@/lib/api"
import { cn, formatTimeOfDay } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type Presence = "ON_SITE" | "FIELD" | "REMOTE"
interface PresenceChangeRow {
  at: string
  presence: Presence
  reason: string
  sentLate: boolean
}

const TONE: Record<Presence, { bar: string; dot: string }> = {
  ON_SITE: { bar: "bg-green-500", dot: "bg-green-500" },
  FIELD: { bar: "bg-amber-500", dot: "bg-amber-500" },
  REMOTE: { bar: "bg-indigo-500", dot: "bg-indigo-500" },
}

/**
 * Where somebody worked through one shift: a bar across the shift and the
 * changes behind it, each with what caused it.
 *
 * Read only when a row is opened. The server returns groups, reasons and
 * times — never a position — and only for entries in the reader's spaces.
 */
export function PresenceDay({
  entryId,
  clockInAt,
  clockOutAt,
  timezone,
  hour12,
  locale,
}: {
  entryId: string
  clockInAt: string
  clockOutAt?: string | null
  timezone?: string | null
  hour12: boolean
  locale?: string
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "entry-presence", entryId],
    queryFn: () => attendanceApi.getEntryPresence(entryId),
    staleTime: 30_000,
  })

  if (isLoading) return <Skeleton className="h-10 w-full" />
  const changes = (data?.changes ?? []) as PresenceChangeRow[]
  if (changes.length === 0) return null

  const start = new Date(clockInAt).getTime()
  const end = clockOutAt ? new Date(clockOutAt).getTime() : Date.now()
  const span = Math.max(1, end - start)
  const segments = changes.map((c, i) => {
    const from = Math.max(start, new Date(c.at).getTime())
    const to = i + 1 < changes.length ? new Date(changes[i + 1].at).getTime() : end
    return { ...c, left: ((from - start) / span) * 100, width: (Math.max(0, to - from) / span) * 100 }
  })

  const label = (p: Presence) =>
    p === "ON_SITE"
      ? t("attendance.presence.onSite", "On site")
      : p === "FIELD"
        ? t("attendance.presence.field", "In the field")
        : t("attendance.presence.remote", "Remote")

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> {t("attendance.presence.title", "Where they worked")}
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("attendance.presence.title", "Where they worked")}>
        {segments.map((s) => (
          <div key={s.at} className={cn("absolute inset-y-0", TONE[s.presence].bar)} style={{ left: `${s.left}%`, width: `${s.width}%` }} />
        ))}
      </div>
      <ol className="divide-y rounded-lg border">
        {changes.map((c) => (
          <li key={c.at} className="grid grid-cols-[4rem_0.75rem_1fr_auto] items-start gap-3 px-3 py-2 text-sm">
            <time className="tabular-nums text-muted-foreground">{formatTimeOfDay(c.at, hour12, locale, timezone)}</time>
            <span className={cn("mt-1.5 h-2 w-2 rounded-full", TONE[c.presence].dot)} aria-hidden />
            <span>
              <span className="font-medium text-foreground">{label(c.presence)}</span>
              <span className="block text-xs text-muted-foreground">{t(`attendance.presence.reasons.${c.reason}`, c.reason)}</span>
            </span>
            {c.sentLate && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {t("attendance.presence.sentLate", "Sent without signal")}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
