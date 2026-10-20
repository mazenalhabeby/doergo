"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowLeft, ClipboardPaste, Loader2, Save, Search } from "lucide-react"
import { useRouteAccess } from "@/hooks/use-route-access"
import { leaveLedgerApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { applyOpeningMatches, openingDraft, openingSaveRows, parseDaysInput, todayKey, type OpeningDraftRow } from "@/lib/leave-ledger"
import { formatDayMonth, formatMediumDate } from "@/lib/format-date"
import { serverErrorMessage } from "@/lib/server-error"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

// The paste panel is behind a tap — not in the first load.
const OpeningPastePanel = dynamic(() => import("./_components/paste-panel").then((m) => m.OpeningPastePanel))

/**
 * Starting balances — what each member had already used this leave year in the
 * system before HBCField, and what they carried in from last year.
 *
 * Filled ONCE, when an organization starts in the middle of a year; without it
 * everybody shows a full year left. Each figure becomes a visible line on that
 * member's ledger ("used before HBCField −10"), never an edited total. The
 * people are the server's list, and pasted text is matched BY THE SERVER — no
 * id is ever taken from what was pasted.
 */
export default function LeaveOpeningPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // The route table already admitted only who decides leave; the server narrows the list to their workspaces.
  const canEdit = useRouteAccess().holds("any:canManageRota")
  /*
    The day HBCField started counting leave — the starting balances are what was
    used BEFORE it, in the leave year that contains it. Today until the server
    says it was already set; changing it re-reads the table for that leave year.
  */
  const [on, setOn] = useState(todayKey)
  const [onTouched, setOnTouched] = useState(false)
  const [draft, setDraft] = useState<OpeningDraftRow[] | null>(null)
  const [search, setSearch] = useState("")
  const [pasting, setPasting] = useState(false)
  const [invalid, setInvalid] = useState<Set<string>>(new Set())

  const opening = useQuery({
    queryKey: keys.timeOff.opening(on),
    queryFn: () => leaveLedgerApi.getOpening(on),
    enabled: canEdit,
  })

  // The table starts from what the server holds; typing is kept local until Save.
  useEffect(() => {
    if (opening.data && draft === null) setDraft(openingDraft(opening.data.rows))
  }, [opening.data, draft])
  // Already started once: open on that day, unless somebody picked another.
  const startedOn = opening.data?.trackingStartedOn
  useEffect(() => {
    if (!onTouched && startedOn && startedOn !== on) {
      setOn(startedOn)
      setDraft(null)
    }
  }, [startedOn, onTouched, on])
  const chooseDay = (day: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day === on) return
    setOnTouched(true)
    setOn(day)
    setDraft(null)
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = draft ?? []
    return q ? all.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : all
  }, [draft, search])

  const dirty = useMemo(() => {
    if (!draft || !opening.data) return false
    const base = new Map(openingDraft(opening.data.rows).map((r) => [r.userId, r]))
    return draft.some((r) => {
      const b = base.get(r.userId)
      return !b || parseDaysInput(b.used) !== parseDaysInput(r.used) || parseDaysInput(b.carried) !== parseDaysInput(r.carried)
    })
  }, [draft, opening.data])

  const save = useMutation({
    mutationFn: () => {
      const body = openingSaveRows(draft ?? [])
      if (!body.ok) {
        setInvalid(new Set(body.invalid))
        throw new Error(t("leaveLedger.opening.fixCells", { count: body.invalid.length }))
      }
      setInvalid(new Set())
      return leaveLedgerApi.saveOpening(on, body.rows)
    },
    onSuccess: () => {
      notify.success(t("leaveLedger.opening.saved"))
      setDraft(null) // re-read from the server
      qc.invalidateQueries({ queryKey: keys.timeOff.opening() })
      qc.invalidateQueries({ queryKey: keys.timeOff.ledger() })
      qc.invalidateQueries({ queryKey: keys.timeOff.myBalance() })
      qc.invalidateQueries({ queryKey: keys.organization.profile() })
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t) || e.message || t("common.error")),
  })

  const setCell = (userId: string, field: "used" | "carried", value: string) =>
    setDraft((d) => (d ?? []).map((r) => (r.userId === userId ? { ...r, [field]: value } : r)))

  const onMatched = (matches: Array<{ userId: string; used: number; carried: number }>) => {
    const { draft: next, filled } = applyOpeningMatches(draft ?? [], matches)
    setDraft(next)
    return filled
  }

  return (
    <div className="min-h-full bg-background">
      <div className={cn(PAGE_WIDTH, "py-6")}>
        <Link
          href="/schedule"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("technicians.availabilityPage.title")}
        </Link>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("leaveLedger.opening.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("leaveLedger.opening.subtitle")}</p>
          </div>
          {canEdit && opening.data && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
                <ClipboardPaste className="size-4" />
                {t("leaveLedger.opening.paste")}
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t("common.save")}
              </Button>
            </div>
          )}
        </header>

        {!canEdit ? (
          <Notice text={t("leaveLedger.opening.noAccess")} />
        ) : opening.isLoading || (opening.data && draft === null) ? (
          <Skeleton className="h-80 w-full rounded-2xl" />
        ) : opening.isError ? (
          <Notice
            text={(opening.error as Error)?.message || t("common.error")}
            onRetry={() => void opening.refetch()}
            retryLabel={t("common.retry", "Retry")}
          />
        ) : opening.data === null ? (
          <Notice text={t("leaveLedger.opening.unavailable")} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <label htmlFor="opening-on" className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("leaveLedger.opening.startedOn")}
                </label>
                <Input
                  id="opening-on"
                  type="date"
                  value={on}
                  onChange={(e) => chooseDay(e.target.value)}
                  className="h-8 w-44 bg-background"
                />
              </div>
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                {t("leaveLedger.opening.yearNote", { date: formatMediumDate(`${on}T12:00:00`) })}
              </p>
            </div>

            {pasting && (
              <OpeningPastePanel onMatched={onMatched} onClose={() => setPasting(false)} />
            )}

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("leaveLedger.opening.search")}
                    className="h-8 pl-8"
                  />
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("leaveLedger.opening.count", { count: draft?.length ?? 0 })}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">{t("leaveLedger.opening.colMember")}</th>
                      <th className="w-44 px-4 py-2.5 text-right font-medium">{t("leaveLedger.opening.colUsed")}</th>
                      <th className="w-44 px-4 py-2.5 text-right font-medium">{t("leaveLedger.opening.colCarried")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((r) => (
                      <tr key={r.userId} className={cn("hover:bg-accent/30", invalid.has(r.userId) && "bg-red-500/5")}>
                        <td className="px-4 py-2">
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.email}
                            {/* In work years each person's year is their own — say which one these days belong to. */}
                            {r.leaveYear?.mode === "WORK_YEAR" && (
                              <> · {formatDayMonth(`${r.leaveYear.start}T12:00:00`)} – {formatDayMonth(`${r.leaveYear.end}T12:00:00`)}</>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <DaysCell
                            label={t("leaveLedger.opening.colUsed")}
                            value={r.used}
                            onChange={(v) => setCell(r.userId, "used", v)}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <DaysCell
                            label={t("leaveLedger.opening.colCarried")}
                            value={r.carried}
                            onChange={(v) => setCell(r.userId, "carried", v)}
                          />
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          {t("leaveLedger.opening.none")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p
                className={"border-t border-border/60 px-4 py-2.5 text-[11.5px] " +
                  "text-muted-foreground"}>{t("leaveLedger.opening.halfDays")}</p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

/** A day count as typed — half days, "10,5" reads 10.5; a cell it cannot read turns red. */
function DaysCell({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const bad = parseDaysInput(value) === null
  return (
    <input
      aria-label={label}
      aria-invalid={bad || undefined}
      inputMode="decimal"
      value={value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        ("h-8 w-24 rounded-lg border bg-background px-2.5 text-right font-mono " +
          "text-sm tabular-nums outline-none transition-colors focus:border-primary"),
        bad ? "border-red-500 text-red-600" : "border-border",
      )}
    />
  )
}

function Notice({ text, onRetry, retryLabel }: { text: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>{retryLabel}</Button>
      )}
    </div>
  )
}
