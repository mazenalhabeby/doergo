"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Check, ChevronDown, ChevronRight, Loader2, Receipt, X } from "lucide-react"

import { assetsApi, type PendingExpense } from "@/lib/api"
import { formatCents } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { initials } from "./holder-picker"
import { ExpenseRefuseDialog } from "./expense-refuse-dialog"
import { logTypeLabel } from "./log-style"

/**
 * Expenses sent in from phones, waiting on somebody in the office.
 *
 * A queue rather than a flag on each record, because nobody opens forty vans to
 * find the two that have a receipt waiting. It sits at the top of the Assets
 * page and disappears entirely when there is nothing in it — a permanent empty
 * panel teaches people to stop looking at that part of the screen.
 */
export function ExpenseQueue() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(true)

  const q = useQuery({
    queryKey: ["asset-expenses-pending"],
    queryFn: () => assetsApi.getPendingExpenses(),
    // The office leaves this page open; a receipt filed at a pump should not
    // need a reload to appear.
    refetchInterval: 120_000,
  })

  const entries = q.data?.entries ?? []
  if (q.isLoading || entries.length === 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-amber-300/70 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              : <ChevronRight className="h-4 w-4 text-amber-700 dark:text-amber-400" />}
        <Receipt className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {t("expenses.waiting", "{{count}} expenses waiting on you", { count: entries.length })}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-200">
          {formatCents(q.data?.totalCents ?? 0)}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-amber-300/60 p-3 dark:border-amber-900/60">
          {entries.map((e) => (
            <PendingRow
              key={e.id}
              entry={e}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["asset-expenses-pending"] })
                qc.invalidateQueries({ queryKey: ["asset-money", e.assetId] })
                qc.invalidateQueries({ queryKey: ["asset-custody", e.assetId] })
                // An accepted logbook entry moves the record's readings and next due.
                qc.invalidateQueries({ queryKey: ["asset-log", e.assetId] })
                qc.invalidateQueries({ queryKey: ["asset-log-summary", e.assetId] })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PendingRow({ entry, onDone }: { entry: PendingExpense; onDone: () => void }) {
  const { t } = useTranslation()
  const author = entry.author
    ? `${entry.author.firstName ?? ""} ${entry.author.lastName ?? ""}`.trim()
    : t("expenses.someone", "Someone")

  const review = useMutation({
    mutationFn: (v: { decision: "accept" | "reject"; note?: string }) =>
      assetsApi.reviewExpense(entry.id, v.decision, v.note),
    onSuccess: onDone,
    onError: (e: Error) => notify.error(e.message),
  })

  /*
    The slip opens through a POST that mints a short-lived link. Nothing lists
    receipt URLs, so this is a click rather than an href — looking at somebody's
    spending stays an act.
  */
  const openReceipt = useMutation({
    mutationFn: () => assetsApi.getReceiptUrl(entry.id),
    onSuccess: (d) => { if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer") },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {initials(author)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entry.asset?.name ? (
            <Link href={`/assets/${entry.assetId}`} className="hover:text-primary">{entry.asset.name}</Link>
          ) : t("expenses.anAsset", "An asset")}
          {/* A logbook entry files under its type's label; a cost under its heading. */}
          <span className="text-muted-foreground"> · {entry.category || logTypeLabel(t, null, entry.logType)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {author} · {new Date(entry.occurredAt).toLocaleDateString()}
          {entry.note ? ` · ${entry.note}` : ""}
        </p>
      </div>

      {entry.hasReceipt && (
        <button
          onClick={() => openReceipt.mutate()}
          disabled={openReceipt.isPending}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("expenses.viewReceipt", "View the receipt")}
          title={t("expenses.viewReceipt", "View the receipt")}
        >
          {openReceipt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
        </button>
      )}

      {/*
        A logbook entry with no money (a dent, a meter reading) waits here too —
        it is still somebody's word the office has to accept. It shows what it
        IS rather than "€0.00", which reads like a receipt nobody filled in.
      */}
      {entry.amountCents > 0 ? (
        <span className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          entry.direction === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        )}>
          {entry.direction === "IN" ? "+" : "−"} {formatCents(entry.amountCents)}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {t("assetLog.logEntry", "Logbook entry")}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {/* Refusing asks why: the member reads the reason under the entry. */}
        <ExpenseRefuseDialog
          pending={review.isPending}
          onRefuse={(note) => review.mutate({ decision: "reject", note })}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              disabled={review.isPending}
              aria-label={t("expenses.reject", "Refuse")}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          }
        />
        <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ decision: "accept" })}>
          {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span className="ml-1 hidden sm:inline">{t("expenses.accept", "Accept")}</span>
        </Button>
      </div>
    </div>
  )
}
