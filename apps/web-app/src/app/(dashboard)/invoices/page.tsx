"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  Eye,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import { summarise, byUrgency, daysOverdue, bandFor, isOutstanding, AGE_BANDS, type AgeBand } from "./_lib/aging"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
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

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400", label: "Draft" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400", label: "Sent" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400", label: "Paid" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400", label: "Overdue" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500 dark:text-slate-500", label: "Canceled" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400", label: "Refunded" },
}

function formatCurrency(amount: number, currency = "USD") {
  // Locale-aware: "1.234,56 €" in de/es/fr/it, "€1,234.56" in en. Was pinned to
  // en-US, which printed US currency convention on a European product.
  return new Intl.NumberFormat(dateLocale(), { style: "currency", currency }).format(amount)
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

  const [statusFilter, setStatusFilter] = useState("__all__")
  const [search, setSearch] = useState("")

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
  const filtered = search
    ? invoices.filter((inv) =>
        inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
        inv.clientName?.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

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
  const totalPaid = invoices.filter((i) => i.status === "PAID").reduce((s: number, i: Invoice) => s + (i.total || 0), 0)

  const BAND_STYLE: Record<AgeBand, { bar: string; dot: string; label: string }> = {
    current:  { bar: "bg-emerald-500",  dot: "bg-emerald-500",  label: t("invoices.aging.current") },
    d1_30:    { bar: "bg-amber-400",    dot: "bg-amber-400",    label: t("invoices.aging.d1_30") },
    d31_60:   { bar: "bg-orange-500",   dot: "bg-orange-500",   label: t("invoices.aging.d31_60") },
    d61_90:   { bar: "bg-red-500",      dot: "bg-red-500",      label: t("invoices.aging.d61_90") },
    d90_plus: { bar: "bg-red-700",      dot: "bg-red-700",      label: t("invoices.aging.d90_plus") },
  }

  return (
    <div className="min-h-full bg-background">
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 data-tour="page-invoices" className="text-2xl font-semibold text-foreground">{t("invoices.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("invoices.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" className="gap-1.5" onClick={() => router.push("/invoices/new")}>
              <Plus className="size-3.5" /> {t("invoices.newInvoice")}
            </Button>
          )}
        </div>

        {/* One figure that matters, and the shape of it. */}
        <div className="grid gap-4 mb-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("invoices.outstanding")}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                  {formatCurrency(aging.outstanding, ccy)}
                </p>
              </div>
              {aging.overdueCount > 0 && (
                <div className="text-right">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{t("invoices.overdue")}</p>
                  <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(aging.overdue, ccy)}
                  </p>
                </div>
              )}
            </div>

            {/* The ageing bar. Proportional, so the eye lands on the oldest
                money without reading a single number. */}
            {aging.outstanding > 0 ? (
              <>
                <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {AGE_BANDS.map((b) => {
                    const pct = (aging.bands[b].amount / aging.outstanding) * 100
                    if (pct <= 0) return null
                    return <div key={b} className={cn("h-full", BAND_STYLE[b].bar)} style={{ width: `${pct}%` }} title={BAND_STYLE[b].label} />
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {AGE_BANDS.map((b) => {
                    const cell = aging.bands[b]
                    if (!cell.count) return null
                    return (
                      <span key={b} className="flex items-center gap-1.5 text-xs">
                        <span className={cn("size-2 rounded-full", BAND_STYLE[b].dot)} />
                        <span className="text-muted-foreground">{BAND_STYLE[b].label}</span>
                        <span className="font-medium tabular-nums text-foreground">{formatCurrency(cell.amount, ccy)}</span>
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("invoices.nothingOutstanding")}</p>
            )}
            {/* Adding euros to dollars produces a number that means nothing.
                Better to admit it than to print a confident total. */}
            {mixedCurrencies && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                {t("invoices.mixedCurrencies", { list: aging.currencies.join(", ") })}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{t("invoices.paid")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalPaid, ccy)}
              </p>
            </div>
            {/* The oldest debt, because that is the one that decides what to do
                today — an average would hide it. */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{t("invoices.oldestDebt")}</p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums",
                aging.oldestDays === null ? "text-muted-foreground"
                : aging.oldestDays > 60 ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400")}>
                {aging.oldestDays === null ? "—" : t("invoices.daysCount", { count: aging.oldestDays })}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("invoices.searchPlaceholder")}
              className="h-8 text-sm pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-[140px]">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="DRAFT">{t("invoices.statuses.draft")}</SelectItem>
              <SelectItem value="SENT">{t("invoices.statuses.sent")}</SelectItem>
              <SelectItem value="PAID">{t("invoices.statuses.paid")}</SelectItem>
              <SelectItem value="OVERDUE">{t("invoices.statuses.overdue")}</SelectItem>
              <SelectItem value="CANCELED">{t("invoices.statuses.canceled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_120px_100px_110px_80px_120px] gap-3 px-4 py-2.5 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30">
            <div>{t("invoices.columns.invoiceNumber")}</div>
            <div>{t("invoices.columns.client")}</div>
            <div className="text-right">{t("invoices.columns.amount")}</div>
            <div>{t("invoices.columns.issueDate")}</div>
            <div>{t("invoices.columns.dueDate")}</div>
            <div>{t("invoices.columns.status")}</div>
            <div />
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("invoices.empty")}</p>
              {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.emptyHint")}</p>}
            </div>
          ) : (
            rows.map((inv) => {
              const status = STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT!
              return (
                <div key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="grid grid-cols-[100px_1fr_120px_100px_110px_80px_120px] gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors items-center cursor-pointer">
                  <span className="text-sm font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inv.clientName}</p>
                    {inv.clientEmail && <p className="text-[11px] text-muted-foreground truncate">{inv.clientEmail}</p>}
                  </div>
                  <span className="text-sm font-semibold text-foreground text-right tabular-nums">{formatCurrency(inv.total, inv.currency)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })}</span>
                  {/* The due date alone does not say how late something is —
                      the reader has to do the arithmetic for every row. The age
                      is the thing that decides whether this is a reminder or a
                      phone call, so it is stated. */}
                  <span className="text-xs">
                    <span className="text-muted-foreground">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) : "—"}
                    </span>
                    {(() => {
                      if (!isOutstanding(inv)) return null
                      const d = daysOverdue(inv.dueDate)
                      if (d === null || d <= 0) return null
                      const band = bandFor(d)
                      return (
                        <span className={cn(
                          "mt-0.5 block font-medium",
                          band === "d1_30" ? "text-amber-600 dark:text-amber-400"
                          : band === "d31_60" ? "text-orange-600 dark:text-orange-400"
                          : "text-red-600 dark:text-red-400",
                        )}>
                          {t("invoices.daysLate", { count: d })}
                        </span>
                      )
                    })()}
                  </span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-center", status.bg, status.text)}>{t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}</span>
                  <div className="flex items-center justify-end gap-1">
                    {/* The next step, stated. Burying "Mark paid" in a kebab
                        menu makes the one action a row exists for the hardest
                        thing on it to find. */}
                    {isAdmin && (inv.status === "DRAFT" || inv.status === "SENT" || inv.status === "OVERDUE") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          statusMutation.mutate({ id: inv.id, status: inv.status === "DRAFT" ? "SENT" : "PAID" })
                        }}
                        disabled={statusMutation.isPending}
                        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                      >
                        {inv.status === "DRAFT" ? t("invoices.actions.send") : t("invoices.actions.markPaid")}
                      </button>
                    )}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button onClick={(e) => e.stopPropagation()} className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/invoices/${inv.id}`)}><Eye className="size-3.5 mr-2" /> {t("invoices.actions.view")}</DropdownMenuItem>
                        {inv.status === "DRAFT" && (
                          <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "SENT" })}>
                            <Send className="size-3.5 mr-2" /> {t("invoices.actions.send")}
                          </DropdownMenuItem>
                        )}
                        {/* OVERDUE too, not just SENT. Being paid late is the
                            most likely thing to happen to an overdue invoice,
                            and the only option here used to be Cancel — which
                            records that it was never owed. */}
                        {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                          <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "PAID" })}>
                            <CheckCircle className="size-3.5 mr-2" /> {t("invoices.actions.markPaid")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {inv.status === "DRAFT" && (
                          <DropdownMenuItem className="text-red-600" onClick={() => deleteMutation.mutate(inv.id)}>
                            <XCircle className="size-3.5 mr-2" /> {t("common.delete")}
                          </DropdownMenuItem>
                        )}
                        {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                          <DropdownMenuItem className="text-red-600" onClick={() => statusMutation.mutate({ id: inv.id, status: "CANCELED" })}>
                            <XCircle className="size-3.5 mr-2" /> {t("common.cancel")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
