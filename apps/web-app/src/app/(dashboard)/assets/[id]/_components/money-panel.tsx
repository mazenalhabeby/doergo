"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react"

import { assetsApi, type AssetMoneyEntry, type CustodyPeriodDto } from "@/lib/api"
import { personName, formatCents, attribute, type CustodyPeriod, type KindShape } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { dateLocale } from "@/lib/format-date"
import Link from "next/link"
import { Inbox } from "lucide-react"
import { EmptyNote } from "@/components/ui/empty-note"

/**
 * What this thing has cost and earned.
 *
 * Totals come from the server over the whole ledger, never from adding up the
 * rows on screen — those are only the most recent ones.
 */
export function MoneyPanel({
  assetId,
  shape,
  loading,
  entries,
  totals,
  periods,
  canManage,
  onChanged,
}: {
  assetId: string
  shape: KindShape
  loading: boolean
  entries: AssetMoneyEntry[]
  totals?: { inCents: number; outCents: number; netCents: number; waitingCount?: number; waitingCents?: number }
  /** Who held it, when — so each row can say whose cost it was. */
  periods: CustodyPeriodDto[]
  canManage: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(shape.money.categories[0]?.label ?? "")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const add = useMutation({
    mutationFn: () =>
      assetsApi.addMoney(assetId, {
        category,
        // Typed in euros, stored in cents — the comma is what people actually
        // type on a German keyboard.
        amountCents: Math.round(parseFloat(amount.replace(",", ".")) * 100),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setAmount("")
      setNote("")
      onChanged()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (entryId: string) => assetsApi.removeMoney(assetId, entryId),
    onSuccess: onChanged,
    onError: (e: Error) => notify.error(e.message),
  })

  /*
    Whose cost was this?

    Computed here from the dates, by the same function the server uses — never
    read off the entry, which does not carry a holder and deliberately never
    will. Correct a handover date and every row in this list re-attributes with
    it, because there is only ever one answer to look up.
  */
  const holderNames = new Map(
    periods.map((p) => [p.id, p.user ? personName(p.user) || p.user.email || "" : (p.customer?.name ?? "")]),
  )
  const attributed = new Map(
    attribute(entries, periods as unknown as CustodyPeriod[]).map(({ entry, heldBy }) => [
      entry.id,
      heldBy?.id ? (holderNames.get(heldBy.id) ?? "") : "",
    ]),
  )

  const parsed = parseFloat(amount.replace(",", "."))
  const canAdd = !!category && Number.isFinite(parsed) && parsed > 0 && !add.isPending

  if (shape.money.categories.length === 0) {
    return (
      <EmptyNote>
        {t("assetMoney.noCategories", "This kind tracks money but has no categories yet — add some on the kind.")}
      </EmptyNote>
    )
  }

  return (
    <div className="space-y-3">
      {/* Totals */}
      {totals && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Total label={t("assetMoney.in", "In")} cents={totals.inCents} tone="in" />
          <Total label={t("assetMoney.out", "Out")} cents={totals.outCents} tone="out" />
          <Total
            label={t("assetMoney.net", "Net")}
            cents={totals.netCents}
            tone={totals.netCents >= 0 ? "in" : "out"}
          />
        </div>
      )}

      {/*
        Waiting is shown BESIDE the totals, never inside them. An expense sent
        from a phone counts for nothing until somebody accepts it — but a
        figure nobody can see is a figure nobody acts on.
      */}
      {!!totals?.waitingCount && (
        <div
          className={
            "flex items-center gap-2 rounded-xl border border-amber-300/70 " +
            "bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/60 " +
            "dark:bg-amber-950/20"
          }
        >
          <Receipt className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <span className="text-amber-900 dark:text-amber-200">
            {t("expenses.waitingHere", "{{count}} waiting on a decision", { count: totals.waitingCount })}
          </span>
          <span className="ml-auto font-semibold tabular-nums text-amber-900 dark:text-amber-200">
            {formatCents(totals.waitingCents ?? 0)}
          </span>
        </div>
      )}

      {/* Add */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-card p-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          {shape.money.categories.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label} {c.direction === "in" ? "↓" : "↑"}
            </option>
          ))}
        </select>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("assetMoney.amount", "Amount")}
          inputMode="decimal"
          className="w-28"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("assetMoney.notePh", "What for?")}
          className="min-w-[8rem] flex-1"
        />
        <Button disabled={!canAdd} onClick={() => add.mutate()}>
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 h-3.5 w-3.5" /> {t("common.add", "Add")}
            </>
          )}
        </Button>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyNote>{t("assetMoney.empty", "Nothing logged yet.")}</EmptyNote>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const waiting = e.status === "SUBMITTED"
            const refused = e.status === "REJECTED"
            const heldBy = attributed.get(e.id)
            return (
              <div
                key={e.id}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border bg-card p-3",
                  waiting ? "border-amber-300/70 dark:border-amber-900/60" : "border-border",
                  refused && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    <span className={cn("truncate", refused && "line-through")}>{e.category}</span>
                    {e.hasReceipt && <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleDateString(dateLocale())}
                    {/* Whose cost it was — computed from the date, never stored. */}
                    {heldBy ? ` · ${heldBy}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>

                {waiting && (
                  <span
                    className={
                      "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold " +
                      "text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                    }
                  >
                    {t("expenses.pending", "Waiting")}
                  </span>
                )}
                {refused && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {t("expenses.rejected", "Refused")}
                  </span>
                )}

                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    refused
                      ? "text-muted-foreground"
                      : e.direction === "IN"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {e.direction === "IN" ? "+" : "−"} {formatCents(e.amountCents)}
                </span>

                {waiting && canManage ? (
                  // Accepting or refusing is decided in Approvals — the one place.
                  <Link
                    href={`/approvals?kind=expense&id=${encodeURIComponent(e.id)}`}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                    aria-label={t("approvals.decideInApprovals")}
                    title={t("approvals.decideInApprovals")}
                  >
                    <Inbox className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    onClick={() => remove.mutate(e.id)}
                    className={
                      "rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
                      "hover:text-destructive group-hover:opacity-100"
                    }
                    aria-label={t("common.remove", "Remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Total({ label, cents, tone }: { label: string; cents: number; tone: "in" | "out" }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        )}
      >
        {formatCents(Math.abs(cents))}
      </p>
    </div>
  )
}
