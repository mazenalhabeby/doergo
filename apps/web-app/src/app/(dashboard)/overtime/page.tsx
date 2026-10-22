"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { addMonths, addWeeks, startOfMonth, startOfWeek } from "date-fns"
import { RefreshCw, XCircle } from "lucide-react"

import { PlanGate } from "@/components/common/plan-gate"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { overtimeApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { mins } from "./_lib/round-words"
import { RunningNow } from "./_components/running-now"
import { ByPerson } from "./_components/by-person"
import { RoundsList } from "./_components/rounds-list"
import { RoundPanel, StateLegend } from "./_components/round-panel"

type Period = "week" | "lastWeek" | "month"
const ALL = "all"

/** The period's edges on the reader's own calendar (a week starts on Monday). */
function periodRange(p: Period, now: Date): { from: Date; to: Date } {
  if (p === "month") {
    const from = startOfMonth(now)
    return { from, to: addMonths(from, 1) }
  }
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 })
  const from = p === "lastWeek" ? addWeeks(thisWeek, -1) : thisWeek
  return { from, to: addWeeks(from, 1) }
}

export default function OvertimePage() {
  return (
    <PlanGate feature="overtime">
      <OvertimePageInner />
    </PlanGate>
  )
}

/**
 * OVERTIME — the record of every round, easy to read (shared attendance/overtime-round.ts).
 *
 * Decisions are made in Approvals; this page says what overtime is, what the
 * period added up to, who is on extra time right now, each person's week, and
 * every round as a sentence. One round opens in the side panel with its own
 * timeline and signature.
 */
function OvertimePageInner() {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const [period, setPeriod] = useState<Period>("week")
  const [spaceId, setSpaceId] = useState<string>(ALL)
  const [personId, setPersonId] = useState<string>(ALL)
  const [selected, setSelected] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Running rounds count up: the page moves on its own every half minute.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const range = useMemo(() => periodRange(period, new Date()), [period])
  const filters = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    spaceId: spaceId === ALL ? undefined : spaceId,
    technicianId: personId === ALL ? undefined : personId,
  }
  const allowed = user?.role === "ADMIN" || hasPermission("canApproveOvertime")

  const summary = useQuery({
    queryKey: keys.overtime.summary(filters),
    queryFn: () => overtimeApi.getSummary(filters),
    enabled: allowed,
    refetchInterval: 60_000,
  })
  const { data: spaces = [] } = useSpaceDirectory({ enabled: allowed })

  // People to pick from: everyone the period or the running list names (kept while one is picked).
  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of summary.data?.people ?? []) m.set(p.userId, p.userName)
    for (const r of summary.data?.running ?? []) m.set(r.userId, r.userName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [summary.data])

  /*
    The page had no permission check of any kind once: every request behind it
    403s without `canApproveOvertime`. `hasPermission` is space-aware, matching
    `@RequirePermissionInSpace` on the routes.
  */
  if (!allowed) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{t("common.accessDenied")}</h2>
          <p className="text-muted-foreground mt-2">{t("common.noPermissionView")}</p>
        </div>
      </div>
    )
  }

  const totals = summary.data?.totals
  const periodLabel = t(`overtimePage.period.${period}`)

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto grid max-w-screen-xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 data-tour="page-overtime" className="text-3xl font-bold tracking-tight text-foreground">{t("overtimePage.title")}</h1>
                <p className="mt-1.5 max-w-3xl text-muted-foreground">{t("overtimePage.explain")}</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
                onClick={() => summary.refetch()}
                aria-label={t("common.refresh", "Refresh")}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <ol className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                  <span className="mr-1 font-semibold text-foreground">{n}</span>
                  {t(`overtimePage.step${n}`)}
                </li>
              ))}
            </ol>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-xl border border-border bg-muted/40 p-1"
              role="tablist"
              aria-label={t("overtimePage.periodLabel")}>
              {(["week", "lastWeek", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    period === p ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`overtimePage.period.${p}`)}
                </button>
              ))}
            </div>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("overtimePage.allWorkspaces")}</SelectItem>
                {spaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("overtimePage.everyone")}</SelectItem>
                {people.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure
              value={totals ? mins(totals.workedMinutes) : "—"}
              label={t("overtimePage.num.worked", { period: periodLabel.toLowerCase() })}
            />
            <Figure value={totals ? String(totals.rounds) : "—"} label={t("overtimePage.num.rounds", { count: totals?.people ?? 0 })} />
            <Figure
              value={summary.data ? String(summary.data.running.length) : "—"}
              label={t("overtimePage.num.running")}
              tone={summary.data?.running.length ? "run" : undefined}
            />
            <Figure
              value={totals ? String(totals.noAnswer) : "—"}
              label={t("overtimePage.num.noAnswer")}
              tone={totals?.noAnswer ? "warn" : undefined}
            />
          </div>

          <RunningNow rounds={summary.data?.running ?? []} now={now} onOpen={setSelected} />
          <ByPerson
            people={summary.data?.people ?? []}
            from={range.from}
            periodLabel={periodLabel}
            loading={summary.isLoading}
            showDays={period !== "month"}
          />
          <RoundsList filters={filters} now={now} selected={selected} onSelect={setSelected} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <RoundPanel id={selected} now={now} onClose={() => setSelected(null)} />
          <StateLegend />
        </aside>
      </div>
    </div>
  )
}

function Figure({ value, label, tone }: { value: string; label: string; tone?: "run" | "warn" }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-4 py-3", tone === "warn" ? "border-amber-500/40" : "border-border")}>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "run"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
