"use client"

import { PlanGate } from "@/components/plan-gate"
// The lifecycle brings the step icons — see `_lib/lifecycle.ts`.
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { SpaceTabs } from "@/components/space-tabs"
import { InvoiceListDialogs } from "./_components/list/invoice-list-dialogs"
import { useInvoicesPageInner } from "./use-invoices-page-inner"
import { InvoicesPageInnerSearchPlaceholder } from "./invoices-page-inner-search-placeholder"

export default function InvoicesPage() {
  return (
    <PlanGate feature="invoicing">
      <InvoicesPageInner />
    </PlanGate>
  )
}

function InvoicesPageInner() {
  const vm = useInvoicesPageInner()
  const {
    t,
    router,
    isAdmin,
    deleteTarget,
    setDeleteTarget,
    sendTarget,
    setSendTarget,
    scope,
    statusMutation,
    deleteMutation,
  } = vm

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
              {scope.space ? t("invoices.inWorkspace", { name: scope.space.name }) : t("invoices.subtitle")}
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

      <InvoicesPageInnerSearchPlaceholder vm={vm} />

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
