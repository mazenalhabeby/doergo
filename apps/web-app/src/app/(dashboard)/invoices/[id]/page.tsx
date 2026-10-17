"use client"

import { PlanGate } from "@/components/plan-gate"
import { use } from "react"
// The lifecycle brings its own icons — see `_lib/lifecycle.ts`.

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
// Types only: the builder (and jsPDF, ~350 kB) loads on the Download / Print click.
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { InvoiceDocument, fmtDate } from "../_components/invoice-document"
import { useInvoiceDetailInner } from "./use-invoice-detail-inner"
import { money } from "./invoice-detail-inner-helpers"
import { InvoiceDetailInnerView } from "./invoice-detail-inner-view"
import { InvoiceDetailInnerPdfLanguage } from "./invoice-detail-inner-pdf-language"

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PlanGate feature="invoicing">
      <InvoiceDetailInner id={id} />
    </PlanGate>
  )
}

// Not exported: a Next.js page module may export only the page and its known fields.
function InvoiceDetailInner({ id }: { id: string }) {
  const vm = useInvoiceDetailInner({ id })
  const {
    t,
    inv,
    isLoading,
    org,
    statusMutation,
    confirmDelete,
    setConfirmDelete,
    confirmStep,
    setConfirmStep,
    deleteMutation,
    branding,
  } = vm

  if (isLoading) {
    return (
      <div className={cn(PAGE_WIDTH, "py-6")}>
        <div className="mx-auto w-full max-w-[820px] space-y-5">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-[32rem] w-full rounded-2xl" />
        </div>
      </div>
    )
  }
  if (!inv) {
    return (
      <div className={cn(PAGE_WIDTH, "py-16 text-center text-sm text-muted-foreground")}>{t("invoices.notFound")}</div>
    )
  }

  const { style, statusLabel, settled, standing, periodLabel, primary, others, step } = InvoiceDetailInnerView({
    t,
    inv,
    statusMutation,
    setConfirmStep,
  })

  return (
    <div className="min-h-full bg-background">
      <InvoiceDetailInnerPdfLanguage
        vm={vm}
        statusLabel={statusLabel}
        style={style}
        primary={primary}
        step={step}
        others={others}
        id={id}
      />

      <div className={cn(PAGE_WIDTH, "py-6")}>
        <div className="mx-auto w-full max-w-[820px] space-y-5">
          {/* ── The answer, above the document ─────────────────────────── */}
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {settled ? t("invoices.detail.amountPaid") : t("invoices.create.amountDue")}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {money(inv.total, inv.currency)}
              </p>
              {/* In another currency than yours: what it was worth on the day, at the rate saved with it. */}
              {inv.exchangeRate != null && inv.baseCurrency && inv.baseCurrency !== inv.currency && (
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {t("currency.convertedAt", {
                    amount: money(inv.total * inv.exchangeRate, inv.baseCurrency),
                    from: inv.currency,
                    rate: inv.exchangeRate,
                    to: inv.baseCurrency,
                  })}
                  {inv.exchangeRateSource === "ECB" &&
                    inv.exchangeRateDate &&
                    ` · ${t("currency.ecbOn", { date: fmtDate(inv.exchangeRateDate) })}`}
                </p>
              )}
              <p className={cn("mt-1 text-xs", standing.tone)}>{standing.text}</p>
            </div>

            <dl className="grid gap-1 text-right text-xs">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">{t("invoices.create.issueDate")}</dt>
                <dd className="tabular-nums">{fmtDate(inv.issueDate)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">{t("invoices.create.dueDate")}</dt>
                <dd className="tabular-nums">{inv.dueDate ? fmtDate(inv.dueDate) : t("invoices.create.onReceipt")}</dd>
              </div>
              {periodLabel && (
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">{t("invoices.create.servicePeriod")}</dt>
                  <dd className="tabular-nums">{periodLabel}</dd>
                </div>
              )}
            </dl>
          </div>

          {/*
            THE DOCUMENT — the same one the create and edit screens render.

            ⚠️ This page used to draw a THIRD version of it, and a poorer one:
            no payment block, no company address, its own table markup, and a
            letterhead reading "NEW INVOICE" because it uppercased the page
            title. Somebody printed that. A document a customer receives cannot
            have three implementations.

            ⚠️ `frames="client"` — the working view is a BUILDING aid. An issued
            invoice has one true form, and offering a second rendering of it
            invites the question of which one the client got.
          */}
          <InvoiceDocument
            showTags={inv.showLineTags !== false}
            view="client"
            onView={() => {}}
            frames="client"
            clientName={inv.clientName}
            clientEmail={inv.clientEmail ?? ""}
            clientAddress={inv.clientAddress ?? ""}
            issueDate={inv.issueDate}
            dueDate={inv.dueDate ?? undefined}
            periodLabel={periodLabel}
            currency={inv.currency}
            taxPct={inv.taxRate ? String(Math.round(inv.taxRate * 100)) : ""}
            discount={String(inv.discount ?? 0)}
            notes={inv.notes ?? ""}
            items={(inv.items ?? []).map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineKind: i.lineKind ?? null,
            }))}
            subtotal={inv.subtotal}
            taxAmount={inv.taxAmount}
            total={inv.total}
            invoiceNumber={inv.invoiceNumber}
            org={org}
            issuer={inv.issuer ?? null}
            logoUrl={branding.logoUrl}
          />
        </div>
      </div>

      {/*
        ── Marking it sent: the one step with no way back ────────────────

        ⚠️ And the place to say what this product does NOT do. Nothing here
        emails the invoice — the button records a delivery the person performs
        themselves — and "Mark as sent" reads exactly like a button that sends.
      */}
      <ConfirmDialog
        open={!!confirmStep}
        onOpenChange={(open) => !open && setConfirmStep(null)}
        title={t("invoices.markSent.title")}
        description={t("invoices.markSent.desc", { number: inv.invoiceNumber, client: inv.clientName })}
        cancelClassName="rounded-lg"
        confirmClassName="rounded-lg"
        confirmLabel={t("invoices.actions.send")}
        onConfirm={() => {
          const to = confirmStep?.to
          setConfirmStep(null)
          if (to) statusMutation.mutate(to)
        }}
      />

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("invoices.delete.title", "Delete this draft invoice?")}
        description={t("invoices.delete.desc", {
          defaultValue:
            "{{number}} for {{client}} — {{total}} — and all of its line items will be deleted. This cannot be undone.",
          number: inv.invoiceNumber,
          client: inv.clientName,
          total: money(inv.total, inv.currency),
        })}
        cancelClassName="rounded-lg"
        destructive
        confirmClassName="rounded-lg focus:ring-red-600"
        confirmDisabled={deleteMutation.isPending}
        confirmLabel={t("common.delete")}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
