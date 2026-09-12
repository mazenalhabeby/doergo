"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
// The lifecycle brings the step icons — see `_lib/lifecycle.ts`.
import { FileText, Plus, Search, MoreHorizontal, XCircle, Eye } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import {
  summarise, byUrgency, daysOverdue, bandFor, isOutstanding, groupByBucket,
  AGE_BANDS, type AgeBand, type Bucket,
} from "./_lib/aging"
import { statusStyle, primaryStep, otherSteps, isDeletable, type LifecycleStep } from "./_lib/lifecycle"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dateLocale } from "@/lib/format-date"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { formatMoney } from "@/lib/money"


function formatCurrency(amount: number, currency = "USD") {
  // Locale-aware: "1.234,56 €" in de/es/fr/it, "€1,234.56" in en. Was pinned to
  // en-US, which printed US currency convention on a European product.
  return formatMoney(amount, currency)
}

/**
 * One quiet fact, and — where there is something to do about it — a way in.
 *
 * ⚠️ `onClick` is what separates a figure from a control. "Overdue €18,740"
 * that cannot be clicked is a number a person then has to go and act on
 * somewhere else; the same number that filters the list below is the shortest
 * path between noticing and doing. It is only offered where there is something
 * to show — a nil figure that looks clickable and does nothing is worse than
 * one that plainly is not.
 */
function Stat({
  label, value, tone, onClick,
}: {
  label: string
  value: string
  tone: "bad" | "warn" | "good" | "muted"
  onClick?: () => void
}) {
  const TONE = {
    bad: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
    good: "text-emerald-600 dark:text-emerald-400",
    muted: "text-foreground",
  } as const

  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", TONE[tone])}>{value}</p>
    </>
  )

  if (!onClick) {
    return <div className="rounded-2xl border border-border bg-card px-4 py-3.5">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-slate-400 focus-visible:border-slate-400 focus-visible:outline-none"
    >
      {body}
    </button>
  )
}

export default function InvoicesPage() {
  return (
    <PlanGate feature="invoicing">
      <InvoicesPageInner />
    </PlanGate>
  )
}

function InvoicesPageInner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"

  /*
    The row being deleted, not a boolean. Deleting was a bare menu item that
    fired on click — in a dropdown, which is exactly where a mis-tap lands —
    and the dialog has to be able to say WHICH invoice and for how much.
  */
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  /**
   * The one-way step, held until it is confirmed.
   *
   * ⚠️ Confirmed HERE too, not only on the invoice page. Marking sent from a
   * list row is the easiest place in the product to do it by accident — the
   * button sits inches from Mark Paid and the document is not even on screen.
   */
  const [sendTarget, setSendTarget] = useState<{ inv: Invoice; step: LifecycleStep } | null>(null)
  const [statusFilter, setStatusFilter] = useState("__all__")
  const [search, setSearch] = useState("")
  /**
   * One ageing band, chosen from the summary.
   *
   * ⚠️ The legend used to be five inert labels: a person read "90+ days
   * €13,450" and then had to find those invoices by hand in a list of fifty.
   * Reading a figure and acting on it were two different jobs on one screen.
   */
  const [bandFilter, setBandFilter] = useState<AgeBand | null>(null)

  /** Take a step, asking first where the lifecycle says to. */
  const step = (inv: Invoice, s: LifecycleStep) =>
    s.confirm ? setSendTarget({ inv, step: s }) : statusMutation.mutate({ id: inv.id, status: s.to })

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => invoicesApi.list({
      status: statusFilter !== "__all__" ? statusFilter : undefined,
      limit: 50,
    }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const invoices: Invoice[] = data?.data ?? []
  const needle = search.trim().toLowerCase()
  const filtered = invoices.filter((inv) => {
    if (needle && !(
      inv.invoiceNumber?.toLowerCase().includes(needle) ||
      inv.clientName?.toLowerCase().includes(needle) ||
      inv.clientEmail?.toLowerCase().includes(needle)
    )) return false
    /*
      ⚠️ A band only describes money that is OWED. Applying it to a paid or
      draft invoice would put settled rows under "90+ days", which is the one
      reading this figure must never produce.
    */
    if (bandFilter && (!isOutstanding(inv) || bandFor(daysOverdue(inv.dueDate)) !== bandFilter)) return false
    return true
  })

  // Most urgent first. A list ordered by invoice number says nothing about what
  // to do next, which is the only question this page exists to answer.
  const rows = [...filtered].sort((a, b) => byUrgency(a, b))

  /*
    Ageing, not four disconnected numbers.

    The old summary counted overdue INVOICES, so five days late and four months
    late were the same fact. They are different problems — a reminder versus a
    phone call — and the age is what decides which. It also mixed money with
    counts across the four cards, so nothing could be compared with anything.
  */
  const aging = summarise(invoices)
  /*
    The summary figures were printed with formatCurrency's DEFAULT — dollars —
    while every row printed the invoice's own currency. The screen showed
    $23,610.50 above a list of euro amounts, which on a money screen is not a
    cosmetic slip.
  */
  const ccy = aging.currencies[0] ?? invoices[0]?.currency ?? "EUR"
  const mixedCurrencies = aging.currencies.length > 1
  /*
    Finished documents the client has not been given — the pile the ISSUED
    state created. Nothing else on this page would show them: they are not
    late, and they are not drafts.
  */
  const awaiting = invoices.filter((i) => i.status === "ISSUED").length

  const BAND_STYLE: Record<AgeBand, { bar: string; dot: string; label: string }> = {
    current:  { bar: "bg-emerald-500",  dot: "bg-emerald-500",  label: t("invoices.aging.current") },
    d1_30:    { bar: "bg-amber-400",    dot: "bg-amber-400",    label: t("invoices.aging.d1_30") },
    d31_60:   { bar: "bg-orange-500",   dot: "bg-orange-500",   label: t("invoices.aging.d31_60") },
    d61_90:   { bar: "bg-red-500",      dot: "bg-red-500",      label: t("invoices.aging.d61_90") },
    d90_plus: { bar: "bg-red-700",      dot: "bg-red-700",      label: t("invoices.aging.d90_plus") },
  }

  const BUCKET_STYLE: Record<Bucket, { label: string; accent: string; dot: string }> = {
    overdue:  { label: t("invoices.buckets.overdue"),  accent: "bg-red-500",     dot: "bg-red-500" },
    open:     { label: t("invoices.buckets.open"),     accent: "bg-blue-500",    dot: "bg-blue-500" },
    draft:    { label: t("invoices.buckets.draft"),    accent: "bg-transparent", dot: "bg-slate-400" },
    settled:  { label: t("invoices.buckets.settled"),  accent: "bg-transparent", dot: "bg-emerald-500" },
  }

  const groups = groupByBucket(rows)
  const filtering = search.trim() !== "" || statusFilter !== "__all__" || bandFilter !== null

  return (
    <div className="min-h-full bg-background">
      {/*
        ⚠️ BAND OUTSIDE, COLUMN INSIDE — the same rule as every invoice screen.
        This page was `max-w-6xl`, three hundred pixels narrower than the
        navigation above it, so the title floated in from the left edge while
        every other page in the product started under the logo.
      */}
      <div className="border-b border-border bg-card/40">
        <div className={cn(PAGE_WIDTH, "flex flex-wrap items-end justify-between gap-4 py-6")}>
          <div>
            <h1 data-tour="page-invoices" className="text-2xl font-semibold tracking-tight text-foreground">
              {t("invoices.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("invoices.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button className="gap-1.5" onClick={() => router.push("/invoices/new")}>
              <Plus className="size-4" /> {t("invoices.newInvoice")}
            </Button>
          )}
        </div>
      </div>

      <div className={cn(PAGE_WIDTH, "py-6")}>
        {/* ── The money, and the shape of it ──────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("invoices.outstanding")}
            </p>
            <p className="mt-1.5 text-[40px] font-semibold leading-none tabular-nums tracking-tight text-foreground">
              {formatCurrency(aging.outstanding, ccy)}
            </p>

            {aging.outstanding > 0 ? (
              <>
                {/* Proportional, so the eye lands on the oldest money without
                    reading a single number. */}
                <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {AGE_BANDS.map((b) => {
                    const pct = (aging.bands[b].amount / aging.outstanding) * 100
                    if (pct <= 0) return null
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBandFilter(bandFilter === b ? null : b)}
                        title={BAND_STYLE[b].label}
                        aria-label={BAND_STYLE[b].label}
                        className={cn(
                          "h-full transition-opacity hover:opacity-80",
                          BAND_STYLE[b].bar,
                          bandFilter !== null && bandFilter !== b && "opacity-30",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    )
                  })}
                </div>

                {/*
                  ⚠️ THE LEGEND IS THE FILTER. It used to be five inert labels:
                  a person read "90+ days €13,450" and then had to go and find
                  those invoices by hand, in a list of fifty. Reading a figure
                  and acting on it were two different jobs on one screen.
                */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {AGE_BANDS.map((b) => {
                    const cell = aging.bands[b]
                    if (!cell.count) return null
                    const on = bandFilter === b
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBandFilter(on ? null : b)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                          on
                            ? "border-foreground/25 bg-muted"
                            : "border-border hover:border-slate-400",
                        )}
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", BAND_STYLE[b].dot)} />
                        <span className="text-muted-foreground">{BAND_STYLE[b].label}</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {formatCurrency(cell.amount, ccy)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{t("invoices.nothingOutstanding")}</p>
            )}

            {/* Adding euros to dollars produces a number that means nothing.
                Better to admit it than to print a confident total. */}
            {mixedCurrencies && (
              <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
                {t("invoices.mixedCurrencies", { list: aging.currencies.join(", ") })}
              </p>
            )}
          </div>

          {/*
            The three quieter facts. Each one is a QUESTION with an answer, and
            two of them are also a way into the list — see `awaiting`, which
            only exists because ISSUED does.
          */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <Stat
              label={t("invoices.overdue")}
              value={formatCurrency(aging.overdue, ccy)}
              tone={aging.overdue > 0 ? "bad" : "muted"}
              onClick={aging.overdueCount > 0 ? () => { setBandFilter(null); setStatusFilter("__all__"); setSearch("") } : undefined}
            />
            {/*
              ⚠️ The pile the new ISSUED state created: finished documents the
              client has not been given. Nothing else on this page would show
              them — they are not late, and they are not drafts.
            */}
            <Stat
              label={t("invoices.awaitingSend")}
              value={String(awaiting)}
              tone={awaiting > 0 ? "warn" : "muted"}
              onClick={awaiting > 0 ? () => { setBandFilter(null); setStatusFilter("ISSUED") } : undefined}
            />
            <Stat
              label={t("invoices.oldestDebt")}
              value={aging.oldestDays === null ? "—" : t("invoices.daysCount", { count: aging.oldestDays })}
              tone={aging.oldestDays === null ? "muted" : aging.oldestDays > 60 ? "bad" : "warn"}
            />
          </div>
        </div>

        {/* ── The list ─────────────────────────────────────────────────── */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
          {/*
            The controls belong TO the list, so they sit on it. They used to
            float in the gap above, attached to nothing.
          */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("invoices.searchPlaceholder")}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("common.allStatuses")}</SelectItem>
                <SelectItem value="DRAFT">{t("invoices.statuses.draft")}</SelectItem>
                {/* ⚠️ In lifecycle order, so the list reads the way the work
                    happens. Issued invoices are the ones waiting on somebody
                    here, which makes this the most useful filter on the menu. */}
                <SelectItem value="ISSUED">{t("invoices.statuses.issued")}</SelectItem>
                <SelectItem value="SENT">{t("invoices.statuses.sent")}</SelectItem>
                <SelectItem value="PAID">{t("invoices.statuses.paid")}</SelectItem>
                <SelectItem value="OVERDUE">{t("invoices.statuses.overdue")}</SelectItem>
                <SelectItem value="CANCELED">{t("invoices.statuses.canceled")}</SelectItem>
              </SelectContent>
            </Select>

            <span className="flex-1" />

            {/*
              ⚠️ SAYS WHAT IS BEING HIDDEN. A filtered list and a nearly-empty
              business look identical, and the ageing chips make it easy to
              leave one on by accident — so the count is stated and there is one
              obvious way back to everything.
            */}
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("invoices.showing", { count: rows.length, total: invoices.length })}
            </span>
            {filtering && (
              <Button
                variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={() => { setSearch(""); setStatusFilter("__all__"); setBandFilter(null) }}
              >
                <XCircle className="size-3.5" /> {t("common.clear", "Clear")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="divide-y divide-border/20">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <FileText className="mx-auto mb-3 size-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {filtering ? t("invoices.noneMatch") : t("invoices.empty")}
              </p>
              {filtering ? (
                <Button
                  variant="outline" size="sm" className="mt-4"
                  onClick={() => { setSearch(""); setStatusFilter("__all__"); setBandFilter(null) }}
                >
                  {t("common.clear", "Clear")}
                </Button>
              ) : (
                isAdmin && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground/60">{t("invoices.emptyHint")}</p>
                    <Button size="sm" className="mt-4 gap-1.5" onClick={() => router.push("/invoices/new")}>
                      <Plus className="size-3.5" /> {t("invoices.newInvoice")}
                    </Button>
                  </>
                )
              )}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.bucket}>
                {/*
                  ⚠️ FOUR PILES, NOT ONE RUN. The list was sorted by urgency —
                  the right order — but a row four months late and a draft
                  nobody has finished sat in the same column of the same table,
                  so the reader rebuilt the piles in their head on every visit.

                  The heading carries the count AND the sum, because "six
                  overdue" and "six overdue worth €18,740" are different facts
                  and only the second one decides what to do this morning.
                */}
                <div className="flex items-center gap-2.5 border-b border-border/40 bg-muted/25 px-4 py-2">
                  <span className={cn("size-1.5 rounded-full", BUCKET_STYLE[group.bucket].dot)} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                    {BUCKET_STYLE[group.bucket].label}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{group.rows.length}</span>
                  <span className="flex-1" />
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                    {formatCurrency(group.total, ccy)}
                  </span>
                </div>

                {group.rows.map((inv) => {
                  const status = statusStyle(inv.status)
                  const primary = primaryStep(inv.status)
                  const others = otherSteps(inv.status)
                  const late = isOutstanding(inv) ? daysOverdue(inv.dueDate) : null
                  const lateBand = late !== null && late > 0 ? bandFor(late) : null

                  return (
                    <div
                      key={inv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                      onKeyDown={(e) => {
                        // ⚠️ A clickable div is unreachable without this. The
                        // whole row is the target, so it has to behave like one.
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          router.push(`/invoices/${inv.id}`)
                        }
                      }}
                      className="group relative flex cursor-pointer items-center gap-4 border-b border-border/20 px-4 py-3.5 pl-5 transition-colors last:border-0 hover:bg-muted/25 focus-visible:bg-muted/25 focus-visible:outline-none"
                    >
                      {/*
                        A hairline in the age's own colour. The band is already
                        on the screen twice — as a bar and as a pill — and this
                        makes a late row findable while SCROLLING, which is how
                        this list is actually read.
                      */}
                      {lateBand && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-y-0 left-0 w-[3px]",
                            lateBand === "d1_30" ? "bg-amber-400"
                            : lateBand === "d31_60" ? "bg-orange-500"
                            : lateBand === "d61_90" ? "bg-red-500"
                            : "bg-red-700",
                          )}
                        />
                      )}

                      {/*
                        ⚠️ THE CLIENT LEADS. The number was first and in mono at
                        100px, so "INV-DEMO-2026-0010" wrapped onto two lines in
                        every row — and it is not what anybody scans by. It is a
                        reference: needed when you have it, never searched for.
                      */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{inv.clientName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          <span className="font-mono">{inv.invoiceNumber}</span>
                          {inv.clientEmail && <span className="opacity-60"> · {inv.clientEmail}</span>}
                        </p>
                      </div>

                      {/* The two dates together, since they are read together. */}
                      <div className="hidden w-[8.5rem] shrink-0 text-right text-[11px] leading-tight text-muted-foreground sm:block">
                        <p className="tabular-nums">
                          {t("invoices.issuedOn", {
                            date: new Date(inv.issueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }),
                          })}
                        </p>
                        <p className="tabular-nums">
                          {inv.dueDate
                            ? t("invoices.dueOn", {
                                date: new Date(inv.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }),
                              })
                            : t("invoices.create.onReceipt")}
                        </p>
                      </div>

                      {/*
                        The due date alone does not say how late something is —
                        the reader has to do the arithmetic for every row. The
                        age decides whether this is a reminder or a phone call,
                        so it is stated.
                      */}
                      <div className="w-[6.5rem] shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(inv.total, inv.currency)}
                        </p>
                        {late !== null && late > 0 && (
                          <p className={cn(
                            "text-[11px] font-medium tabular-nums",
                            lateBand === "d1_30" ? "text-amber-600 dark:text-amber-400"
                            : lateBand === "d31_60" ? "text-orange-600 dark:text-orange-400"
                            : "text-red-600 dark:text-red-400",
                          )}>
                            {t("invoices.daysLate", { count: late })}
                          </p>
                        )}
                      </div>

                      <span className={cn(
                        "hidden w-[5.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] md:block",
                        status.bg, status.text,
                      )}>
                        {t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}
                      </span>

                      <div className="flex w-[7.5rem] shrink-0 items-center justify-end gap-1">
                        {/*
                          ⚠️ The next step, stated — and only on hover or focus
                          once the row is not the one being acted on. Fifty rows
                          each shouting an action is fifty things competing with
                          the figure beside them; revealing it keeps the column
                          quiet without burying the one action a row exists for.
                        */}
                        {isAdmin && primary && (
                          <button
                            onClick={(e) => { e.stopPropagation(); step(inv, primary) }}
                            disabled={statusMutation.isPending}
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:opacity-100 disabled:opacity-50 group-hover:opacity-100"
                          >
                            {t(primary.labelKey)}
                          </button>
                        )}
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t("common.more", "More")}
                                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => router.push(`/invoices/${inv.id}`)}>
                                <Eye className="mr-2 size-3.5" /> {t("invoices.actions.view")}
                              </DropdownMenuItem>
                              {/*
                                ⚠️ The SAME lifecycle the invoice page reads.
                                This row and that bar each had their own idea of
                                what came next and already disagreed about where
                                Cancel lived — and this one still offered
                                DRAFT → SENT, which the server no longer allows.
                              */}
                              {primary && (
                                <DropdownMenuItem onClick={() => step(inv, primary)}>
                                  <primary.icon className="mr-2 size-3.5" /> {t(primary.labelKey)}
                                </DropdownMenuItem>
                              )}
                              {others.filter((o) => !o.destructive).map((o) => (
                                <DropdownMenuItem key={o.to} onClick={() => step(inv, o)}>
                                  <o.icon className="mr-2 size-3.5" /> {t(o.labelKey)}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              {isDeletable(inv.status) && (
                                <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(inv)}>
                                  <XCircle className="mr-2 size-3.5" /> {t("common.delete")}
                                </DropdownMenuItem>
                              )}
                              {others.filter((o) => o.destructive).map((o) => (
                                <DropdownMenuItem key={o.to} className="text-red-600" onClick={() => step(inv, o)}>
                                  <o.icon className="mr-2 size-3.5" /> {t(o.labelKey)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))
          )}
        </div>
      </div>

      {/*
        ── Marking it sent: the one step with no way back ────────────────

        ⚠️ And the place to say what this product does NOT do. Nothing here
        emails the invoice — the button records a delivery the person performs
        themselves — and "Mark as sent" reads exactly like a button that sends.
      */}
      <AlertDialog open={!!sendTarget} onOpenChange={(open) => !open && setSendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.markSent.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.markSent.desc", {
                number: sendTarget?.inv.invoiceNumber ?? "",
                client: sendTarget?.inv.clientName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              onClick={() => {
                /* ⚠️ The HELD step's destination, never a literal — the dialog
                   must agree with the button that opened it. */
                const target = sendTarget
                setSendTarget(null)
                if (target) statusMutation.mutate({ id: target.inv.id, status: target.step.to })
              }}
            >
              {t("invoices.actions.send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoices.delete.title", "Delete this draft invoice?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                t("invoices.delete.desc", {
                  defaultValue:
                    "{{number}} for {{client}} — {{total}} — and all of its line items will be deleted. This cannot be undone.",
                  number: deleteTarget.invoiceNumber,
                  client: deleteTarget.clientName,
                  total: formatCurrency(deleteTarget.total, deleteTarget.currency),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
