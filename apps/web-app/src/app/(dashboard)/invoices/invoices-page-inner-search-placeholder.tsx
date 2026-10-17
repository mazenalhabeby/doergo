"use client"

import { companyName } from "@/components/companies/company-select"
import { FileText, Plus, Search, XCircle } from "lucide-react"
import { formatCurrency } from "./_lib/list-format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { AgingSummary } from "./_components/list/aging-summary"
import { InvoiceRow } from "./_components/list/invoice-row"
import type { InvoicesPageInnerState } from "./use-invoices-page-inner"

/** Part of InvoicesPageInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function InvoicesPageInnerSearchPlaceholder({ vm }: { vm: InvoicesPageInnerState }) {
  const {
    aging,
    ccy,
    mixedCurrencies,
    awaiting,
    bandFilter,
    setBandFilter,
    setStatusFilter,
    setSearch,
    search,
    t,
    statusFilter,
    severalCompanies,
    companyFilter,
    setCompanyFilter,
    companies,
    rows,
    invoices,
    filtering,
    isLoading,
    isAdmin,
    router,
    groups,
    BUCKET_STYLE,
    step,
    statusMutation,
    setDeleteTarget,
  } = vm
  return (
    <div className={cn(PAGE_WIDTH, "py-6")}>
      {/* ── The money, and the shape of it ──────────────────────────── */}
      <AgingSummary
        aging={aging}
        ccy={ccy}
        mixedCurrencies={mixedCurrencies}
        awaiting={awaiting}
        bandFilter={bandFilter}
        setBandFilter={setBandFilter}
        setStatusFilter={setStatusFilter}
        setSearch={setSearch}
      />

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
          {severalCompanies && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-9 w-[170px] text-sm" aria-label={t("companies.column")}>
                <SelectValue placeholder={t("companies.column")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("companies.filterAll")}</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {companyName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("")
                setStatusFilter("__all__")
                setCompanyFilter("__all__")
                setBandFilter(null)
              }}
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
            <p className="text-sm text-muted-foreground">{filtering ? t("invoices.noneMatch") : t("invoices.empty")}</p>
            {filtering ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch("")
                  setStatusFilter("__all__")
                  setCompanyFilter("__all__")
                  setBandFilter(null)
                }}
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

              {group.rows.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  isAdmin={isAdmin}
                  severalCompanies={severalCompanies}
                  step={step}
                  stepPending={statusMutation.isPending}
                  onOpen={(id) => router.push(`/invoices/${id}`)}
                  onDelete={setDeleteTarget}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
