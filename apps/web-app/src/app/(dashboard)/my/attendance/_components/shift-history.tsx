"use client"

import { useTranslation } from "react-i18next"
import { MapPin, Home } from "lucide-react"
import { useTimeFormat } from "@/hooks"
import { cn } from "@/lib/utils"
import { countryFromTz, formatDuration } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import { deriveAttendanceFlags } from "@/lib/attendance-status"
import { dateLocale } from "@/lib/format-date"

/** Human-readable duration between two ISO timestamps (or to now). */
function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—"
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  return formatDuration(Math.max(0, Math.round((to - from) / 60000)))
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" })
}

/** The member's own shifts in the chosen window — one row each, or why there are none. */
export function ShiftHistory({
  isLoading,
  entries,
  effectiveRange,
}: {
  isLoading: boolean
  entries: TimeEntry[]
  effectiveRange: { startDate: string; endDate: string }
}) {
  const { t } = useTranslation()
  const { formatTime, locale } = useTimeFormat()
  return isLoading ? (
    <div className={"rounded-2xl border border-border bg-card py-12 text-center text-sm " + "text-muted-foreground"}>
      {t("common.loading")}
    </div>
  ) : entries.length === 0 ? (
    <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
      {/* Which window is empty — "no records" alone reads as "you have never
            worked here", when it usually means "not in these dates". */}
      {t("attendance.my.noneInRange", "No shifts between {{from}} and {{to}}.", {
        from: new Date(`${effectiveRange.startDate}T00:00:00`).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        }),
        to: new Date(`${effectiveRange.endDate}T00:00:00`).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        }),
      })}
    </div>
  ) : (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {entries.map((e, i) => (
        <div key={e.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
          <div className="w-28 shrink-0">
            <div className="text-sm font-medium text-foreground">{fmtDate(e.clockInAt)}</div>
            {countryFromTz(e.timezone ?? e.location?.timezone, locale) && (
              <div className="text-xs text-muted-foreground">
                {countryFromTz(e.timezone ?? e.location?.timezone, locale)}
              </div>
            )}
          </div>
          <div className="flex-1 text-sm text-muted-foreground">
            {/* A dot before the times: running, or done. Colour is the
                  only thing that has to be read at a glance here. */}
            <span
              className={cn(
                "mr-2 inline-block size-1.5 rounded-full align-middle",
                e.clockOutAt ? "bg-muted-foreground/40" : "bg-emerald-500",
              )}
            />
            {formatTime(e.clockInAt, e.timezone ?? e.location?.timezone)} →{" "}
            {e.clockOutAt ? (
              formatTime(e.clockOutAt, e.timezone ?? e.location?.timezone)
            ) : (
              <span className="text-green-600">{t("attendance.my.active")}</span>
            )}
            {/*
                An away day still belongs to a workspace, so it names the site
                AND says they were away from it. The old branch showed one or
                the other, which lost the site on every remote day — the very
                fact the timesheet is grouped by.
              */}
            {e.location?.name ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                {e.isRemote ? <Home className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                {e.location.name}
                {e.isRemote ? ` · ${t("attendance.my.away", "away")}` : ""}
                {e.isRemote && e.clockInPlace ? ` · ${e.clockInPlace}` : ""}
              </span>
            ) : e.isRemote ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Home className="h-3 w-3" />
                {t("attendance.my.remote", "Remote")}
                {e.clockInPlace ? ` · ${e.clockInPlace}` : ""}
              </span>
            ) : null}
          </div>
          {/*
              Why a shift is worth a second look — late, overtime, no
              clock-out. The member already sees these on their manager's
              screen; hiding them here meant the first they knew of a query
              was somebody asking about it.
            */}
          {!!e.flagReasons?.length && (
            <div className="hidden shrink-0 gap-1 sm:flex">
              {/*
                  The one flag mapping (lib/attendance-status): what asks for a
                  look comes first and stays amber; what only says how the
                  entry was made (automatic clock, recorded offline) is neutral.
                */}
              {deriveAttendanceFlags(e, { locale })
                .slice(0, 2)
                .map((f) => (
                  <span
                    key={f.key}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                      f.tone === "muted"
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {f.label}
                  </span>
                ))}
            </div>
          )}
          <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {duration(e.clockInAt, e.clockOutAt)}
          </div>
        </div>
      ))}
    </div>
  )
}
