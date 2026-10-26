"use client"

import { PlanGate } from "@/components/common/plan-gate"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader } from "@/components/page/page-kit"
import { SpaceTabs } from "@/components/spaces/space-tabs"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { InvoiceListDialogs } from "./_components/list/invoice-list-dialogs"
import { AgingSummary } from "./_components/list/aging-summary"
import { InvoiceList } from "./_components/list/invoice-list"
import { useInvoiceList } from "./_hooks/use-invoice-list"

export default function InvoicesPage() {
  return (
    <PlanGate feature="invoicing">
      <InvoiceBook />
    </PlanGate>
  )
}

/** One book of invoices — the whole organization's, or one workspace's. */
function InvoiceBook() {
  const { t } = useTranslation()
  const router = useRouter()
  const list = useInvoiceList()
  const { isAdmin, deleteTarget, setDeleteTarget, sendTarget, setSendTarget, scope, statusMutation, deleteMutation } =
    list

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tour="page-invoices"
        title={t("invoices.title")}
        /* Which workspace, said in words when the tabs are not there to say it. A single-workspace organization
           should still know whose book it is looking at. */
        subtitle={scope.space ? t("invoices.inWorkspace", { name: scope.space.name }) : t("invoices.subtitle")}
        actions={
          isAdmin && (
            <Button
              size="pillLg"
              /* ⚠️ Carries the workspace through. Choosing one here and then
                 being asked again on the next screen is the same question
                 twice, and the second answer is the one that counts. */
              onClick={() => router.push(scope.spaceId ? `/invoices/new?spaceId=${scope.spaceId}` : "/invoices/new")}
            >
              <Icon name="plus" size={18} /> {t("invoices.newInvoice")}
            </Button>
          )
        }
      />

      {scope.showTabs && (
        <div className="mb-5">
          <SpaceTabs
            spaces={scope.spaces.map((sp) => ({ id: sp.id, name: sp.name }))}
            value={scope.spaceId}
            onChange={scope.setSpaceId}
            allLabel={t("invoices.allSpaces")}
          />
        </div>
      )}

      <div>
        {/* ── The money, and the shape of it ──────────────────────────── */}
        <AgingSummary
          aging={list.aging}
          ccy={list.ccy}
          mixedCurrencies={list.mixedCurrencies}
          awaiting={list.awaiting}
          bandFilter={list.bandFilter}
          setBandFilter={list.setBandFilter}
          setStatusFilter={list.setStatusFilter}
          setSearch={list.setSearch}
        />

        {/* ── The list ─────────────────────────────────────────────────── */}
        <InvoiceList
          search={list.search}
          setSearch={list.setSearch}
          statusFilter={list.statusFilter}
          setStatusFilter={list.setStatusFilter}
          companyFilter={list.companyFilter}
          setCompanyFilter={list.setCompanyFilter}
          setBandFilter={list.setBandFilter}
          companies={list.companies}
          severalCompanies={list.severalCompanies}
          rows={list.rows}
          invoices={list.invoices}
          groups={list.groups}
          ccy={list.ccy}
          filtering={list.filtering}
          isLoading={list.isLoading}
          isAdmin={isAdmin}
          step={list.step}
          statusMutation={statusMutation}
          setDeleteTarget={setDeleteTarget}
        />
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
