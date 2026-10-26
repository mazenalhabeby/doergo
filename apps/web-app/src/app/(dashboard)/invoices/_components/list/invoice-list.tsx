"use client"

import { companyName } from "@/components/companies/company-select"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { formatCurrency } from "../../_lib/list-format"
import type { Bucket } from "../../_lib/aging"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Count, GroupLabel, Panel } from "@/components/page/page-kit"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InvoiceRow } from "./invoice-row"
import { InvoiceListHead, StatusTabs } from "./invoice-list-head"
import type { InvoiceListState } from "../../_hooks/use-invoice-list"
import { SearchPill } from "@/components/page/page-controls"

/** The invoice list: its search and filters, then the four piles (or the empty state). */
export function InvoiceList({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  companyFilter,
  setCompanyFilter,
  setBandFilter,
  companies,
  severalCompanies,
  rows,
  invoices,
  groups,
  ccy,
  filtering,
  isLoading,
  isAdmin,
  step,
  statusMutation,
  setDeleteTarget,
}: Pick<
  InvoiceListState,
  | "search"
  | "setSearch"
  | "statusFilter"
  | "setStatusFilter"
  | "companyFilter"
  | "setCompanyFilter"
  | "setBandFilter"
  | "companies"
  | "severalCompanies"
  | "rows"
  | "invoices"
  | "groups"
  | "ccy"
  | "filtering"
  | "isLoading"
  | "isAdmin"
  | "step"
  | "statusMutation"
  | "setDeleteTarget"
>) {
  const { t } = useTranslation()
  const router = useRouter()

  const BUCKET_STYLE: Record<Bucket, { label: string; dot: string }> = {
    overdue: { label: t("invoices.buckets.overdue"), dot: "bg-shell-crit" },
    open: { label: t("invoices.buckets.open"), dot: "bg-shell-accent" },
    draft: { label: t("invoices.buckets.draft"), dot: "bg-muted-foreground/50" },
    settled: { label: t("invoices.buckets.settled"), dot: "bg-shell-live" },
  }
  const clearAll = () => {
    setSearch("")
    setStatusFilter("__all__")
    setCompanyFilter("__all__")
    setBandFilter(null)
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* The status as tabs, in lifecycle order — the list reads the way the work happens. Issued invoices are the
          ones waiting on somebody here, which makes that the most useful tab. */}
      <StatusTabs value={statusFilter} onChange={setStatusFilter} />

      {/*
          The controls belong TO the list, so they sit right on it.
        */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/*
            ⚠️ SAYS WHAT IS BEING HIDDEN. A filtered list and a nearly-empty
            business look identical, and the ageing chips make it easy to
            leave one on by accident — so the count is stated and there is one
            obvious way back to everything.
          */}
        <span className="mr-auto text-[13.5px] tabular-nums text-muted-foreground">
          {t("invoices.showing", { count: rows.length, total: invoices.length })}
        </span>
        {filtering && (
          <Button variant="ghost" size="pill" className="text-muted-foreground" onClick={clearAll}>
            <Icon name="closeLine" size={16} /> {t("common.clear", "Clear")}
          </Button>
        )}
        <SearchPill
          className="sm:w-[280px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("invoices.searchPlaceholder")}
        />
        {severalCompanies && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-[38px] w-[180px] rounded-xl text-[13.5px]" aria-label={t("companies.column")}>
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
      </div>

      <Panel className="p-1.5">
        {isLoading ? (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-3.5 py-4">
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
          <div className="px-4 py-14 text-center">
            <Icon name="invoices" size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{filtering ? t("invoices.noneMatch") : t("invoices.empty")}</p>
            {filtering ? (
              <Button variant="outline" size="pill" className="mt-4" onClick={clearAll}>
                {t("common.clear", "Clear")}
              </Button>
            ) : (
              isAdmin && (
                <>
                  <p className="mt-1 text-xs text-muted-foreground/70">{t("invoices.emptyHint")}</p>
                  <Button size="pill" className="mt-4" onClick={() => router.push("/invoices/new")}>
                    <Icon name="plus" size={16} /> {t("invoices.newInvoice")}
                  </Button>
                </>
              )
            )}
          </div>
        ) : (
          <>
            <InvoiceListHead />
            {groups.map((group) => (
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
                <GroupLabel tone={group.bucket === "overdue" ? "crit" : "soft"} className="pt-4">
                  <span className={cn("size-[7px] rounded-full", BUCKET_STYLE[group.bucket].dot)} />
                  {BUCKET_STYLE[group.bucket].label}
                  <Count n={group.rows.length} tone={group.bucket === "overdue" ? "crit" : "soft"} />
                  <span className="ml-auto normal-case tracking-normal tabular-nums text-foreground">
                    {formatCurrency(group.total, ccy)}
                  </span>
                </GroupLabel>

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
            ))}
          </>
        )}
      </Panel>
    </div>
  )
}
