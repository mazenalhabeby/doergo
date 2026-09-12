"use client"

import { PlanGate } from "@/components/plan-gate"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Download, Printer, FileCheck, CheckCircle, XCircle, Trash2, Pencil, Loader2, MoreHorizontal } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, organizationsApi, type Invoice } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { exportInvoicePdf, renderInvoicePdfUrl, type InvoicePdfData, type InvoiceBranding } from "@/lib/invoice-pdf"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { formatMoney } from "@/lib/money"
import { InvoiceTopBar } from "../_components/invoice-shell"
import { InvoiceDocument } from "../_components/invoice-document"
import { daysOverdue } from "../_lib/aging"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
}

function money(n: number, currency: string) {
  return formatMoney(n, currency)
}
function fmtDate(d?: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PlanGate feature="invoicing">
      <InvoiceDetailInner id={id} />
    </PlanGate>
  )
}

function toPdfData(inv: Invoice): InvoicePdfData {
  return {
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    clientName: inv.clientName,
    clientEmail: inv.clientEmail,
    clientAddress: inv.clientAddress,
    currency: inv.currency,
    subtotal: inv.subtotal,
    taxRate: inv.taxRate,
    taxAmount: inv.taxAmount,
    discount: inv.discount,
    total: inv.total,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    servicePeriodFrom: inv.servicePeriodFrom,
    servicePeriodTo: inv.servicePeriodTo,
    notes: inv.notes,
    items: (inv.items || []).map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
  }
}

function InvoiceDetailInner({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"
  const [busy, setBusy] = useState(false)

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoicesApi.getById(id),
  })
  const { data: org } = useQuery({
    queryKey: ["orgProfile"],
    queryFn: () => organizationsApi.getProfile(),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: ["invoice", id] })
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })
  /*
    Deleting used to happen on one click, from a button sitting beside Print.
    A draft invoice is still an invoice somebody assembled — this one is worth
    €65,625 — and its line items go with it. The dialog names the amount,
    because "delete this draft" and "delete sixty-five thousand euros" are not
    the same sentence to read.
  */
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      router.push("/invoices")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const branding: InvoiceBranding = org ?? {}

  const download = async () => {
    if (!inv) return
    setBusy(true)
    try { await exportInvoicePdf(toPdfData(inv), branding) } catch (e) { notify.error(e instanceof Error ? e.message : "PDF failed") } finally { setBusy(false) }
  }
  const print = async () => {
    if (!inv) return
    setBusy(true)
    try {
      const url = await renderInvoicePdfUrl(toPdfData(inv), branding)
      const w = window.open(url, "_blank")
      if (w) { w.onload = () => { try { w.focus(); w.print() } catch { /* pop-up print blocked */ } } }
    } catch (e) { notify.error(e instanceof Error ? e.message : "PDF failed") } finally { setBusy(false) }
  }

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
      <div className={cn(PAGE_WIDTH, "py-16 text-center text-sm text-muted-foreground")}>
        {t("invoices.notFound")}
      </div>
    )
  }

  const style = STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT!
  const statusLabel = t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)

  /*
    WHAT A PERSON OPENED THIS PAGE TO KNOW.

    ⚠️ The total used to be the last line of a table at the bottom of the sheet,
    and the state was a 10px chip beside the number. So the two questions an
    invoice is opened for — how much, and where does it stand — were the two
    hardest things on the page to find. The document is still the document; this
    says the answer above it.
  */
  const late = daysOverdue(inv.dueDate)
  const settled = inv.status === "PAID"
  // Cancelled: no longer owed and no longer chased. REFUNDED has a style in
  // the map but is not in `InvoiceStatus` — the map predates the union.
  const dead = inv.status === "CANCELED"
  const overdue = !settled && !dead && late !== null && late > 0

  const standing = settled
    ? { text: t("invoices.detail.paidOn", { date: fmtDate(inv.paidAt) }), tone: "text-green-700 dark:text-green-400" }
    : dead
      ? { text: statusLabel, tone: "text-muted-foreground" }
      : overdue
        ? { text: t("invoices.detail.overdueBy", { count: late! }), tone: "text-red-600 dark:text-red-400" }
        : inv.dueDate
          ? {
              text: late === 0
                ? t("invoices.detail.dueToday")
                : t("invoices.detail.dueIn", { count: Math.abs(late ?? 0) }),
              tone: "text-muted-foreground",
            }
          : { text: t("invoices.create.onReceipt"), tone: "text-muted-foreground" }

  const periodLabel = inv.servicePeriodFrom && inv.servicePeriodTo
    ? `${fmtDate(inv.servicePeriodFrom)} – ${fmtDate(inv.servicePeriodTo)}`
    : inv.servicePeriodFrom
      ? t("invoices.create.periodFromOnly", { from: fmtDate(inv.servicePeriodFrom) })
      : inv.servicePeriodTo
        ? t("invoices.create.periodToOnly", { to: fmtDate(inv.servicePeriodTo) })
        : ""

  const canEdit = isAdmin && inv.status === "DRAFT"
  const canCancel = isAdmin && (inv.status === "SENT" || inv.status === "OVERDUE")

  return (
    <div className="min-h-full bg-background">
      <InvoiceTopBar
        title={inv.invoiceNumber}
        subtitle={inv.clientName}
        status={{ label: statusLabel, className: cn(style.bg, style.text) }}
        onBack={() => router.back()}
      >
        <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={print}>
          <Printer className="size-3.5" />
          <span className="hidden sm:inline">{t("invoices.actions.print")}</span>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={download}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span className="hidden sm:inline">{t("invoices.actions.pdf")}</span>
        </Button>

        {/*
          ⚠️ ONE primary action, decided by where the invoice stands. A draft is
          sent; a sent invoice is paid. Showing both at once would ask somebody
          to work out which one this invoice is up to.
        */}
        {isAdmin && inv.status === "DRAFT" && (
          <Button size="sm" className="gap-1.5" onClick={() => statusMutation.mutate("SENT")}>
            <FileCheck className="size-3.5" /> {t("invoices.actions.send")}
          </Button>
        )}
        {isAdmin && (inv.status === "SENT" || inv.status === "OVERDUE") && (
          <Button size="sm" className="gap-1.5" onClick={() => statusMutation.mutate("PAID")}>
            <CheckCircle className="size-3.5" /> {t("invoices.actions.markPaid")}
          </Button>
        )}

        {/*
          ⚠️ Edit, cancel and delete used to float under the sheet in a bare row
          with no container — three ghost buttons adrift at the bottom of the
          page, two of them destructive and one of them red next to "Edit".
          They belong with the other actions, and behind one more click.
        */}
        {(canEdit || canCancel) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-8 shrink-0" aria-label={t("common.more", "More")}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => router.push(`/invoices/${id}/edit`)}>
                  <Pencil className="mr-2 size-3.5" /> {t("common.edit", "Edit")}
                </DropdownMenuItem>
              )}
              {canCancel && (
                <DropdownMenuItem className="text-red-600" onClick={() => statusMutation.mutate("CANCELED")}>
                  <XCircle className="mr-2 size-3.5" /> {t("invoices.actions.cancelInvoice", "Cancel invoice")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 size-3.5" /> {t("common.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </InvoiceTopBar>

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
              <p className={cn("mt-1 text-xs", standing.tone)}>{standing.text}</p>
            </div>

            <dl className="grid gap-1 text-right text-xs">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">{t("invoices.create.issueDate")}</dt>
                <dd className="tabular-nums">{fmtDate(inv.issueDate)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">{t("invoices.create.dueDate")}</dt>
                <dd className="tabular-nums">
                  {inv.dueDate ? fmtDate(inv.dueDate) : t("invoices.create.onReceipt")}
                </dd>
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
            }))}
            subtotal={inv.subtotal}
            taxAmount={inv.taxAmount}
            total={inv.total}
            invoiceNumber={inv.invoiceNumber}
            org={org}
            logoUrl={branding.logoUrl}
          />
        </div>
      </div>


      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoices.delete.title", "Delete this draft invoice?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.delete.desc", {
                defaultValue:
                  "{{number}} for {{client}} — {{total}} — and all of its line items will be deleted. This cannot be undone.",
                number: inv.invoiceNumber,
                client: inv.clientName,
                total: money(inv.total, inv.currency),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
