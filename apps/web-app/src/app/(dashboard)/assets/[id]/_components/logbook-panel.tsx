"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Gauge, Loader2, Receipt, Trash2, X } from "lucide-react"

import {
  formatCents, kindMeters, logTypesForKind, findLogType,
  type KindShape,
} from "@hbcfield/shared/client"
import { assetsApi, type AssetLogDue, type AssetLogEntry } from "@/lib/api"
import { logColor, logTypeLabel } from "@/components/assets/log-style"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { LogEntryDialog } from "./log-entry-dialog"

/** Every query this panel reads, so a write can refresh exactly them. */
export const logbookKeys = (assetId: string) => [
  ["asset-log", assetId],
  ["asset-log-summary", assetId],
  ["asset", assetId],
  ["asset-money", assetId],
  ["asset-custody", assetId],
  ["asset-expenses-pending"],
] as const

const personName = (p?: { firstName?: string; lastName?: string; name?: string } | null) =>
  p ? (p.name ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()) : ""

/**
 * The logbook: what has been done to this thing, by whom, and what comes next.
 *
 * Every figure at the top comes from the SERVER — readings and due state are
 * stored on the asset at each write, and the period split is computed there
 * with the shared rules — never from adding up the rows on screen, which are
 * only the most recent page.
 *
 * Money is credited to the person who LOGGED it, once. On a shared machine
 * "who held it that day" is a whole shift; the author is one person and was
 * there.
 */
export function LogbookPanel({ assetId, shape, canManage }: { assetId: string; shape: KindShape; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [typeFilter, setTypeFilter] = useState("")
  const [authorFilter, setAuthorFilter] = useState("")

  const types = useMemo(() => logTypesForKind(shape), [shape])
  const meters = useMemo(() => kindMeters(shape.logTypes), [shape])

  const summaryQ = useQuery({
    queryKey: ["asset-log-summary", assetId],
    queryFn: () => assetsApi.getLogSummary(assetId),
  })

  const logQ = useInfiniteQuery({
    queryKey: ["asset-log", assetId, typeFilter, authorFilter],
    queryFn: ({ pageParam }) =>
      assetsApi.getLog(assetId, {
        logType: typeFilter || undefined,
        authorId: authorFilter || undefined,
        cursor: pageParam || undefined,
        limit: 30,
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const refresh = () => {
    for (const key of logbookKeys(assetId)) qc.invalidateQueries({ queryKey: key as unknown as string[] })
  }

  const entries = logQ.data?.pages.flatMap((p) => p.entries) ?? []
  const summary = summaryQ.data

  // Everyone the filter can offer: who logged in this period, and who is on screen.
  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of summary?.byAuthor ?? []) if (a.authorId) m.set(a.authorId, personName(a.author))
    for (const e of entries) if (e.authorId && e.author) m.set(e.authorId, personName(e.author))
    return [...m.entries()].filter(([, n]) => n)
  }, [summary, entries])

  const monthOut = (summary?.byType ?? []).reduce((n, x) => n + x.outCents, 0)
  const monthIn = (summary?.byType ?? []).reduce((n, x) => n + x.inCents, 0)
  const monthEntries = (summary?.byType ?? []).reduce((n, x) => n + x.entries, 0)
  const maxAuthorOut = Math.max(1, ...(summary?.byAuthor ?? []).map((a) => a.outCents))
  const typeSpend = (summary?.byType ?? []).filter((x) => x.outCents > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("assetLog.subtitle", "What has been done to it, by whom, and what is due next.")}
        </p>
        <LogEntryDialog assetId={assetId} shape={shape} onSaved={refresh} />
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      {summaryQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : summary ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Kpi label={t("assetLog.readings", "Latest readings")}>
            {meters.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("assetLog.noMeters", "No counters on this kind")}</p>
            ) : (
              meters.map((m) => {
                const r = summary.readings[m.key]
                return (
                  <p key={m.key} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> {m.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {r ? `${r.value.toLocaleString()}${m.unit ? ` ${m.unit}` : ""}` : "—"}
                    </span>
                  </p>
                )
              })
            )}
          </Kpi>
          <Kpi label={t("assetLog.thisMonth", "This month")}>
            <p className="text-lg font-semibold tabular-nums text-foreground">{formatCents(monthOut)}</p>
            <p className="text-xs text-muted-foreground">
              {t("assetLog.entriesCount", "{{count}} entries", { count: monthEntries })}
              {monthIn > 0 ? ` · + ${formatCents(monthIn)}` : ""}
              {summary.waitingCount > 0 ? ` · ${t("expenses.waitingHere", "{{count}} waiting on a decision", { count: summary.waitingCount })}` : ""}
            </p>
          </Kpi>
          <Kpi label={t("assetLog.nextDue", "Next due")}>
            {summary.due.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("assetLog.nothingDue", "Nothing scheduled yet")}</p>
            ) : (
              summary.due
                .slice()
                .sort((a, b) => b.progress - a.progress)
                .slice(0, 3)
                .map((d) => <DueRow key={d.key} due={d} />)
            )}
          </Kpi>
        </div>
      ) : null}

      {/* ── Who spent what, and on which kind of work ─────────────────── */}
      {summary && (summary.byAuthor.some((a) => a.outCents > 0) || typeSpend.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t("assetLog.byPerson", "Who spent what")}</p>
            <div className="space-y-2">
              {summary.byAuthor.filter((a) => a.outCents > 0).map((a) => (
                <div key={a.authorId ?? "nobody"}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate text-foreground">{personName(a.author) || t("assetLog.unknownAuthor", "Not recorded")}</span>
                    <span className="tabular-nums font-medium text-foreground">{formatCents(a.outCents)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground/60" style={{ width: `${(a.outCents / maxAuthorOut) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t("assetLog.byType", "By type")}</p>
            {typeSpend.length > 0 && (
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {typeSpend.map((x) => (
                  <div key={x.logType} className={logColor(x.color).bar} style={{ width: `${(x.outCents / Math.max(1, monthOut)) * 100}%` }} />
                ))}
              </div>
            )}
            <div className="mt-2 space-y-1">
              {typeSpend.map((x) => (
                <p key={x.logType} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", logColor(x.color).dot)} />
                    {logTypeLabel(t, findLogType(shape, x.logType), x.logType)}
                  </span>
                  <span className="tabular-nums text-foreground">{formatCents(x.outCents)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          aria-label={t("assetLog.filterType", "Type")}
        >
          <option value="">{t("assetLog.allTypes", "All types")}</option>
          {types.map((x) => <option key={x.key} value={x.key}>{logTypeLabel(t, x)}</option>)}
        </select>
        <select
          value={authorFilter}
          onChange={(e) => setAuthorFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          aria-label={t("assetLog.filterPerson", "Person")}
        >
          <option value="">{t("assetLog.everyone", "Everyone")}</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {logQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("assetLog.empty", "Nothing logged yet.")}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              assetId={assetId}
              entry={e}
              shape={shape}
              canManage={canManage}
              isMine={!!user?.id && e.authorId === user.id}
              onChanged={refresh}
            />
          ))}
          {logQ.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" disabled={logQ.isFetchingNextPage} onClick={() => logQ.fetchNextPage()}>
                {logQ.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("assetLog.loadMore", "Show older entries")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/** One type's next due: a bar that fills with whichever limit is nearer. */
function DueRow({ due }: { due: AssetLogDue }) {
  const { t } = useTranslation()
  const pct = Math.min(100, Math.round(due.progress * 100))
  const parts = [
    due.daysLeft !== null
      ? due.daysLeft >= 0
        ? t("assetLog.inDays", "in {{count}} days", { count: due.daysLeft })
        : t("assetLog.daysOver", "{{count}} days overdue", { count: -due.daysLeft })
      : null,
    due.unitsLeft !== null
      ? due.unitsLeft >= 0
        ? t("assetLog.inUnits", "in {{amount}}", { amount: `${due.unitsLeft.toLocaleString()}${due.unit ? ` ${due.unit}` : ""}` })
        : t("assetLog.unitsOver", "{{amount}} overdue", { amount: `${(-due.unitsLeft).toLocaleString()}${due.unit ? ` ${due.unit}` : ""}` })
      : null,
  ].filter(Boolean)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1 truncate text-foreground">
          {due.stage === "overdue" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
          {due.label}
        </span>
        <span className={cn(
          "shrink-0 text-xs",
          due.stage === "overdue" ? "text-destructive" : due.stage === "soon" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}>
          {parts.join(" · ")}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            due.stage === "overdue" ? "bg-destructive" : due.stage === "soon" ? "bg-amber-500" : "bg-foreground/50",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function EntryRow({
  assetId, entry, shape, canManage, isMine, onChanged,
}: {
  assetId: string
  entry: AssetLogEntry
  shape: KindShape
  canManage: boolean
  isMine: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState("")
  const type = findLogType(shape, entry.logType)
  const color = logColor(type?.color)
  const waiting = entry.status === "SUBMITTED"
  const refused = entry.status === "REJECTED"

  const review = useMutation({
    mutationFn: (v: { decision: "accept" | "reject"; note?: string }) => assetsApi.reviewExpense(entry.id, v.decision, v.note),
    onSuccess: () => { setRefusing(false); setReason(""); onChanged() },
    onError: (e: Error) => notify.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => assetsApi.removeLogEntry(assetId, entry.id),
    onSuccess: onChanged,
    onError: (e: Error) => notify.error(e.message),
  })
  const openPhoto = useMutation({
    mutationFn: () => assetsApi.getReceiptUrl(entry.id),
    onSuccess: (d) => { if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer") },
    onError: (e: Error) => notify.error(e.message),
  })

  /*
    The answers, in the TYPE's order and words. A value whose field the kind has
    since removed is still shown under its key: it is history, and hiding it
    would make an entry look emptier than what was written.
  */
  const values = entry.values ?? {}
  const shown = [
    ...(type?.fields ?? [])
      // A cost's heading is already in its title, so it is not repeated here.
      .filter((f) => f.type !== "photo" && f.type !== "money" && values[f.key] !== undefined && !(entry.logType === "cost" && f.key === "category"))
      .map((f) => {
        const v = values[f.key]!
        const text = typeof v === "number" ? v.toLocaleString() : v
        return `${f.label}: ${text}${f.unit ? ` ${f.unit}` : ""}`
      }),
    ...Object.entries(values)
      .filter(([k]) => !type?.fields.some((f) => f.key === k))
      .map(([k, v]) => `${k}: ${v}`),
  ]
  const canRemove = canManage || (isMine && waiting)

  return (
    <div className={cn(
      "group rounded-xl border bg-card p-3",
      waiting ? "border-amber-300/70 dark:border-amber-900/60" : "border-border",
      refused && "opacity-60",
    )}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", color.dot)} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className={cn("truncate", refused && "line-through")}>
              {logTypeLabel(t, type, entry.logType)}
              {/* A cost says which heading it went under. */}
              {entry.logType === "cost" && entry.category ? ` · ${entry.category}` : ""}
            </span>
            {entry.hasReceipt && (
              <button
                onClick={() => openPhoto.mutate()}
                disabled={openPhoto.isPending}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={t("assetLog.openPhoto", "Open the photo")}
                title={t("assetLog.openPhoto", "Open the photo")}
              >
                {openPhoto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
              </button>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {new Date(entry.occurredAt).toLocaleDateString()}
            {entry.author ? ` · ${personName(entry.author)}` : ""}
            {entry.note ? ` · ${entry.note}` : ""}
          </p>
          {shown.length > 0 && <p className="mt-0.5 text-xs text-foreground/80">{shown.join(" · ")}</p>}
          {refused && entry.reviewNote && (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("assetLog.refusedBecause", "Refused: {{reason}}", { reason: entry.reviewNote })}</p>
          )}
        </div>

        {waiting && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            {t("expenses.pending", "Waiting")}
          </span>
        )}
        {refused && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {t("expenses.rejected", "Refused")}
          </span>
        )}

        {entry.amountCents > 0 && (
          <span className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            refused ? "text-muted-foreground" : entry.direction === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
          )}>
            {entry.direction === "IN" ? "+" : "−"} {formatCents(entry.amountCents)}
          </span>
        )}

        {waiting && canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setRefusing((v) => !v)}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
              aria-label={t("expenses.reject", "Refuse")}
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => review.mutate({ decision: "accept" })}
              disabled={review.isPending}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-emerald-600"
              aria-label={t("expenses.accept", "Accept")}
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : canRemove ? (
          <button
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label={t("common.remove", "Remove")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* A refusal carries its reason: the member reads it, and one with none teaches nothing. */}
      {refusing && (
        <div className="mt-2 flex items-center gap-2 pl-5">
          <Input
            autoFocus
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("assetLog.refuseReason", "Why is this refused?")}
            className="h-8"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={!reason.trim() || review.isPending}
            onClick={() => review.mutate({ decision: "reject", note: reason.trim() })}
          >
            {t("expenses.reject", "Refuse")}
          </Button>
        </div>
      )}
    </div>
  )
}
