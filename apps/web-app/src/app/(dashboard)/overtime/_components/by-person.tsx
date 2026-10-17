"use client"

import { useTranslation } from "react-i18next"
import { addDays, format } from "date-fns"
import type { OvertimePersonRow } from "@hbcfield/shared/client"
import { UserAvatar } from "@/components/user-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { mins } from "../_lib/round-words"

/**
 * Each person's overtime in the period: rounds, minutes agreed, minutes
 * counted — and, for a week, a small bar per day so a pattern shows.
 */
export function ByPerson(
  {
    people,
    from,
    periodLabel,
    loading,
    showDays
  }: { people: OvertimePersonRow[]; from: Date; periodLabel: string; loading: boolean; showDays: boolean }) {
  const { t, i18n } = useTranslation()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" })

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{t("overtimePage.byPerson.title")}</h2>
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : people.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("overtimePage.byPerson.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("overtimePage.byPerson.person")}</th>
                {showDays && (
                  <th className="px-3 py-2.5">
                    <span className="flex gap-[3px]">
                      {days.map((d) => <span key={d.toISOString()} className="w-[9px] text-center">{weekday.format(d)}</span>)}
                    </span>
                  </th>
                )}
                <th className="px-3 py-2.5 text-right">{t("overtimePage.byPerson.rounds")}</th>
                <th className="px-3 py-2.5 text-right">{t("overtimePage.byPerson.agreed")}</th>
                <th className="px-4 py-2.5 text-right">{t("overtimePage.byPerson.worked")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const most = Math.max(1, ...Object.values(p.byDay))
                const [first, ...rest] = p.userName.split(" ")
                return (
                  <tr key={p.userId} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <UserAvatar firstName={first} lastName={rest.join(" ")} avatarUrl={p.avatarUrl} seed={p.userId} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{p.userName}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.spaceNames.join(" · ")}</span>
                        </span>
                      </span>
                    </td>
                    {showDays && <td className="px-3 py-2.5">
                      <span className="flex h-6 items-end gap-[3px]">
                        {days.map((d) => {
                          const m = p.byDay[format(d, "yyyy-MM-dd")] ?? 0
                          return (
                            <span
                              key={d.toISOString()}
                              title={`${d.toLocaleDateString(i18n.language)} · ${m ? mins(m) : "—"}`}
                              className={m ? "w-[9px] rounded-sm bg-primary/80" : "h-[3px] w-[9px] rounded-sm bg-border"}
                              style={m ? { height: `${Math.max(15, Math.round((m / most) * 100))}%` } : undefined}
                            />
                          )
                        })}
                      </span>
                    </td>}
                    <td className="px-3 py-2.5 text-right">{p.rounds}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{mins(p.agreedMinutes)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">{mins(p.workedMinutes)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
