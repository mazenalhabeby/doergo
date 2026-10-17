"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Download, FileText } from "lucide-react"

import { organizationsApi } from "@/lib/api"
import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import { formatDayKey } from "@/lib/day-key"
import { formatHoursMinutes, localDateKey, todayKey } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { keys } from "@/lib/query-keys"

/**
 * A worker's statement: their hours, per workspace, at THEIR rate with us.
 *
 * ⚠️ Same jobs and hours as the client invoice, different rate. The client is
 * billed the workspace rate; this reads the member's own (the cost side of the
 * same ladder), as it stood on the day each job was done — so re-opening
 * October next year still shows October's rate.
 *
 * Read-only: nothing is stored, it is worked out each time from the jobs.
 */

type Preset = "lastMonth" | "thisMonth" | "custom"

function monthBounds(shift: number): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + shift, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + shift + 1, 0)
  const key = (d: Date) => localDateKey(d)
  return [key(first), key(last)]
}

const LEVEL_KEY = {
  contract: "members.statement.levelContract",
  member: "members.statement.levelMember",
  client: "members.statement.levelClient",
  organization: "members.statement.levelOrganization",
} as const

export function StatementTab({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation()
  const [preset, setPreset] = useState<Preset>("lastMonth")
  const [custom, setCustom] = useState<[string, string]>(monthBounds(-1))
  const [from, to] = preset === "lastMonth" ? monthBounds(-1) : preset === "thisMonth" ? monthBounds(0) : custom

  const { data, isLoading, error } = useQuery({
    queryKey: keys.memberRecord.statement(memberId, from, to),
    queryFn: () => organizationsApi.getStatement(memberId, { from, to }),
  })

  const money = useMemo(() => (cents: number) => formatMoney(cents, data?.currency ?? "EUR", MONEY_LOCALE), [data?.currency])
  const period = `${formatDayKey(from, i18n.language)} – ${formatDayKey(to, i18n.language)}`

  const download = async () => {
    if (!data) return
    // The PDF builder (and jsPDF with it) loads on the click, not with the
    // member profile — most visits to a profile never download a statement.
    let exportStatementPdf: typeof import("@/lib/statement-pdf").exportStatementPdf
    try {
      ;({ exportStatementPdf } = await import("@/lib/statement-pdf"))
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "PDF failed")
      return
    }
    exportStatementPdf(
      data,
      {
        title: t("members.statement.title"),
        member: t("members.statement.member"),
        period: t("members.statement.period"),
        workspace: t("members.statement.workspace"),
        days: t("members.statement.days"),
        hours: t("members.statement.hours"),
        rate: t("members.statement.rate"),
        amount: t("members.statement.amount"),
        total: t("members.statement.total"),
        noWorkspace: t("members.statement.noWorkspace"),
        noRate: t("members.statement.noRate"),
        generated: t("members.statement.generated"),
      },
      { money, period, today: formatDayKey(todayKey(), i18n.language) },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("members.statement.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("members.statement.intro")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={download} disabled={!data || data.lines.length === 0}>
          <Download className="h-4 w-4" />
          {t("members.statement.downloadPdf")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label={t("members.statement.period")}
          className="inline-flex gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
          {(["lastMonth", "thisMonth", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              onClick={() => setPreset(p)}
              className={cn(
                ("rounded-md px-3 py-1 text-[13px] transition-colors " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"),
                preset === p ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`members.statement.${p}`)}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <DatePicker value={custom[0]} onChange={(v) => v && setCustom(([, b]) => [v, b < v ? v : b])} className="w-40" />
            <span className="text-muted-foreground">–</span>
            <DatePicker value={custom[1]} onChange={(v) => v && setCustom(([a]) => [a > v ? v : a, v])} className="w-40" />
          </div>
        )}
        {preset !== "custom" && <span className="text-sm text-muted-foreground">{period}</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{(error as Error).message}</p>
        ) : !data || data.lines.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">{t("members.statement.empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium">{t("members.statement.workspace")}</th>
                  <th className="w-16 px-2 py-2.5 text-right font-medium">{t("members.statement.days")}</th>
                  <th className="w-20 px-2 py-2.5 text-right font-medium">{t("members.statement.hours")}</th>
                  <th className="w-36 px-2 py-2.5 text-right font-medium">{t("members.statement.rate")}</th>
                  <th className="w-32 px-5 py-2.5 text-right font-medium">{t("members.statement.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={`${l.spaceId}-${l.rateCents}-${i}`} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-foreground">{l.spaceName ?? t("members.statement.noWorkspace")}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.basis === "days"
                          ? t("members.statement.daysRun", { count: l.days ?? 0 })
                          : t("members.statement.jobs", { count: l.jobs })}
                        {" · "}{formatDayKey(l.fromDay, i18n.language, { year: false })}
                        {l.toDay !== l.fromDay && ` – ${formatDayKey(l.toDay, i18n.language, { year: false })}`}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                      {l.basis === "days" ? l.days : l.spaceId != null ? data.daysBySpace[l.spaceId] ?? 0 : ""}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {l.basis === "days" ? (
                        <span
                          className="text-muted-foreground"
                          title={t("members.statement.onSite", { hours: formatHoursMinutes(l.hours) })}>{formatHoursMinutes(l.hours)}</span>
                      ) : formatHoursMinutes(l.hours)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {l.rateCents == null ? (
                        <span className="text-amber-600 dark:text-amber-400">{t("members.statement.noRate")}</span>
                      ) : (
                        <>
                          {money(l.rateCents)}
                          {l.basis === "days" && <span className="text-[11px] text-muted-foreground"> {t("rates.perDay")}</span>}
                          {l.rateLevel && (
                            <span className="block text-[11px] text-muted-foreground">{t(LEVEL_KEY[l.rateLevel])}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{money(l.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20 font-semibold">
                  <td className="px-5 py-3">{t("members.statement.total")}</td>
                  <td />
                  <td className="px-2 py-3 text-right tabular-nums">{formatHoursMinutes(data.totalHours)}</td>
                  <td />
                  <td className="px-5 py-3 text-right tabular-nums">{money(data.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {data?.missingRate && (
        <p
          className={"flex items-start gap-2 rounded-lg border border-amber-500/30 " +
            "bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("members.statement.missingRate")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("members.statement.sameHours")}</p>
    </div>
  )
}
