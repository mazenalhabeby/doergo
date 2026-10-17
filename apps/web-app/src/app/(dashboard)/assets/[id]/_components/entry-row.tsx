"use client"

import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Receipt, Trash2 } from "lucide-react"
import { formatCents, findLogType, personName, logValueLines, type KindShape } from "@hbcfield/shared/client"
import { assetsApi, type AssetLogDue, type AssetLogEntry } from "@/lib/api"
import { logColor, logTypeLabel } from "@/components/assets/log-style"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { dateLocale } from "@/lib/format-date"
import Link from "next/link"
import { Inbox } from "lucide-react"

/** Every query this panel reads, so a write can refresh exactly them. */
export const logbookKeys = (assetId: string) => [
  keys.assets.log(assetId),
  keys.assets.logSummary(assetId),
  keys.assets.record(assetId),
  keys.assets.money(assetId),
  keys.assets.custody(assetId),
  keys.assets.expensesPending(),
] as const

export function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/** One type's next due: a bar that fills with whichever limit is nearer. */
export function DueRow({ due }: { due: AssetLogDue }) {
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

export function EntryRow({
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
  const type = findLogType(shape, entry.logType)
  const color = logColor(type?.color)
  const waiting = entry.status === "SUBMITTED"
  const refused = entry.status === "REJECTED"

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
  const shown = logValueLines(entry, type)
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
            {new Date(entry.occurredAt).toLocaleDateString(dateLocale())}
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
          // Accepting or refusing is decided in Approvals — the one place.
          <Link
            href={`/approvals?kind=expense&id=${encodeURIComponent(entry.id)}`}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-primary"
            aria-label={t("approvals.decideInApprovals")}
            title={t("approvals.decideInApprovals")}
          >
            <Inbox className="h-4 w-4" />
          </Link>
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

    </div>
  )
}
