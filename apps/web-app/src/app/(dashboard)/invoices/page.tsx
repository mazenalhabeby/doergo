"use client"

import { companyName, useCompanies } from "@/components/companies/company-select"
import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
// The lifecycle brings the step icons — see `_lib/lifecycle.ts`.
import { FileText, Plus, Search, XCircle } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import {
  summarise, byUrgency, daysOverdue, bandFor, isOutstanding, groupByBucket,
  type AgeBand, type Bucket,
} from "./_lib/aging"
import { type LifecycleStep } from "./_lib/lifecycle"
import { formatCurrency } from "./_lib/list-format"
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
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { SpaceTabs } from "@/components/space-tabs"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { keys } from "@/lib/query-keys"
import { AgingSummary } from "./_components/list/aging-summary"
import { InvoiceRow } from "./_components/list/invoice-row"
import { InvoiceListDialogs } from "./_components/list/invoice-list-dialogs"


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
  // Which company issued them — offered only when the organization invoices as more than one.
  const [companyFilter, setCompanyFilter] = useState("__all__")
  const { companies, hasSeveral: severalCompanies } = useCompanies()
  const [search, setSearch] = useState("")
  /**
   * One ageing band, chosen from the summary.
   *
   * ⚠️ The legend used to be five inert labels: a person read "90+ days
   * €13,450" and then had to find those invoices by hand in a list of fifty.
   * Reading a figure and acting on it were two different jobs on one screen.
   */
  const [bandFilter, setBandFilter] = useState<AgeBand | null>(null)

  /*
    WHICH WORKSPACE'S BOOK.

    ⚠️ Invoices were a TAB inside one workspace's settings — Spaces → a
    workspace → Configure → Invoices, and the same four steps again for the
    next one. Clients, assets and portals made this move already: they are what
    a workspace HAS, not how it is configured, and that page is configuration.
    Invoices are the same thing and were left behind, with the note that
    "per-space billing IS a setting" — which was true of the module and never
    of the invoices.

    ⚠️ Filtered by KIND, not by a module. You invoice a customer site, never
    your own warehouse, and offering an internal workspace would be a tab
    leading to a screen where nothing can be created.
  */
  const scope = useSpaceScope({ kind: "CUSTOMER" })

  /** Take a step, asking first where the lifecycle says to. */
  const step = (inv: Invoice, s: LifecycleStep) =>
    s.confirm ? setSendTarget({ inv, step: s }) : statusMutation.mutate({ id: inv.id, status: s.to })

  const { data, isLoading } = useQuery({
    queryKey: keys.invoices.list(statusFilter, companyFilter, scope.spaceId),
    queryFn: () => invoicesApi.list({
      status: statusFilter !== "__all__" ? statusFilter : undefined,
      legalEntityId: companyFilter !== "__all__" ? companyFilter : undefined,
      spaceId: scope.spaceId ?? undefined,
      limit: 50,
    }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: keys.invoices.all() })
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
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


  const BUCKET_STYLE: Record<Bucket, { label: string; accent: string; dot: string }> = {
    overdue:  { label: t("invoices.buckets.overdue"),  accent: "bg-red-500",     dot: "bg-red-500" },
    open:     { label: t("invoices.buckets.open"),     accent: "bg-blue-500",    dot: "bg-blue-500" },
    draft:    { label: t("invoices.buckets.draft"),    accent: "bg-transparent", dot: "bg-slate-400" },
    settled:  { label: t("invoices.buckets.settled"),  accent: "bg-transparent", dot: "bg-emerald-500" },
  }

  const groups = groupByBucket(rows)
  const filtering = search.trim() !== "" || statusFilter !== "__all__" || companyFilter !== "__all__" || bandFilter !== null

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
            {/*
              Which workspace, said in words when the tabs are not there to say
              it. A single-workspace organization should still know whose book
              it is looking at.
            */}
            <p className="mt-1 text-sm text-muted-foreground">
              {scope.space
                ? t("invoices.inWorkspace", { name: scope.space.name })
                : t("invoices.subtitle")}
            </p>
          </div>
          {isAdmin && (
            <Button
              className="gap-1.5"
              /* ⚠️ Carries the workspace through. Choosing one here and then
                 being asked again on the next screen is the same question
                 twice, and the second answer is the one that counts. */
              onClick={() => router.push(scope.spaceId ? `/invoices/new?spaceId=${scope.spaceId}` : "/invoices/new")}
            >
              <Plus className="size-4" /> {t("invoices.newInvoice")}
            </Button>
          )}
        </div>

        {scope.showTabs && (
          <div className={cn(PAGE_WIDTH, "pb-1")}>
            <SpaceTabs
              spaces={scope.spaces.map((sp) => ({ id: sp.id, name: sp.name }))}
              value={scope.spaceId}
              onChange={scope.setSpaceId}
              allLabel={t("invoices.allSpaces")}
            />
          </div>
        )}
      </div>

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
                    <SelectItem key={c.id} value={c.id}>{companyName(c)}</SelectItem>
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
                variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={() => { setSearch(""); setStatusFilter("__all__"); setCompanyFilter("__all__"); setBandFilter(null) }}
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
                  onClick={() => { setSearch(""); setStatusFilter("__all__"); setCompanyFilter("__all__"); setBandFilter(null) }}
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

      <InvoiceListDialogs
        sendTarget={sendTarget}
        setSendTarget={setSendTarget}
        onStatus={(v) => statusMutation.mutate(v)}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        onDelete={(id) => deleteMutation.mutate(id)}
        deletePending={deleteMutation.isPending}
      />
    </div>
  )
}
