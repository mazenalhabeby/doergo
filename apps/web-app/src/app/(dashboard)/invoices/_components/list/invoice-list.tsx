"use client"

import { companyName } from "@/components/companies/company-select"
import { FileText, Plus, Search, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { formatCurrency } from "../../_lib/list-format"
import type { Bucket } from "../../_lib/aging"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InvoiceRow } from "./invoice-row"
import type { InvoiceListState } from "../../_hooks/use-invoice-list"

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

  const BUCKET_STYLE: Record<Bucket, { label: string; accent: string; dot: string }> = {
    overdue: { label: t("invoices.buckets.overdue"), accent: "bg-red-500", dot: "bg-red-500" },
    open: { label: t("invoices.buckets.open"), accent: "bg-blue-500", dot: "bg-blue-500" },
    draft: { label: t("invoices.buckets.draft"), accent: "bg-transparent", dot: "bg-slate-400" },
    settled: { label: t("invoices.buckets.settled"), accent: "bg-transparent", dot: "bg-emerald-500" },
  }

  return (
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
  )
}
