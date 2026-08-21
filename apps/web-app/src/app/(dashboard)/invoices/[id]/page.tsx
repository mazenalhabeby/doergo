"use client"

import { PlanGate } from "@/components/plan-gate"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Download, Printer, Send, CheckCircle, XCircle, Trash2, Loader2 } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, organizationsApi, type Invoice } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { exportInvoicePdf, renderInvoicePdfUrl, type InvoicePdfData, type InvoiceBranding } from "@/lib/invoice-pdf"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
}

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" }).format(n || 0)
  } catch {
    return `${(n || 0).toFixed(2)} ${currency}`
  }
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
    return <div className="p-8 max-w-3xl mx-auto"><Skeleton className="h-96 w-full rounded-2xl" /></div>
  }
  if (!inv) {
    return <div className="p-8 max-w-3xl mx-auto text-center text-sm text-muted-foreground">{t("invoices.notFound")}</div>
  }

  const status = STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT!

  return (
    <div className="min-h-full bg-background">
      <div className="p-8 max-w-3xl mx-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => router.back()}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold font-mono text-foreground">{inv.invoiceNumber}</h1>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", status.bg, status.text)}>
                  {t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{inv.clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={print}>
              <Printer className="size-3.5" /> {t("invoices.actions.print")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={download}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {t("invoices.actions.pdf")}
            </Button>
            {isAdmin && inv.status === "DRAFT" && (
              <Button size="sm" className="gap-1.5" onClick={() => statusMutation.mutate("SENT")}>
                <Send className="size-3.5" /> {t("invoices.actions.send")}
              </Button>
            )}
            {isAdmin && (inv.status === "SENT" || inv.status === "OVERDUE") && (
              <Button size="sm" className="gap-1.5" onClick={() => statusMutation.mutate("PAID")}>
                <CheckCircle className="size-3.5" /> {t("invoices.actions.markPaid")}
              </Button>
            )}
          </div>
        </div>

        {/* Invoice preview */}
        <div className="bg-card rounded-2xl border border-border p-8">
          {/* Letterhead */}
          <div className="flex items-start justify-between mb-8">
            <div>
              {branding.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt="" className="h-10 mb-2 object-contain" />
              )}
              <p className="text-lg font-semibold text-foreground">{branding.name || "—"}</p>
              {branding.vatId && <p className="text-xs text-muted-foreground">VAT / UID: {branding.vatId}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-brand-600">{t("invoices.create.title").toUpperCase()}</p>
              <p className="text-sm font-mono text-foreground mt-1">{inv.invoiceNumber}</p>
            </div>
          </div>

          {/* Bill to + dates */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wider mb-1">{t("invoices.detail.billTo")}</p>
              <p className="text-sm font-medium text-foreground">{inv.clientName}</p>
              {inv.clientAddress && <p className="text-xs text-muted-foreground whitespace-pre-line">{inv.clientAddress}</p>}
              {inv.clientEmail && <p className="text-xs text-muted-foreground">{inv.clientEmail}</p>}
            </div>
            <div className="text-right space-y-1">
              <div className="flex justify-between"><span className="text-xs text-muted-foreground">{t("invoices.create.issueDate")}</span><span className="text-xs font-medium">{fmtDate(inv.issueDate)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-muted-foreground">{t("invoices.create.dueDate")}</span><span className="text-xs font-medium">{fmtDate(inv.dueDate)}</span></div>
              {inv.paidAt && <div className="flex justify-between"><span className="text-xs text-muted-foreground">{t("invoices.statuses.paid")}</span><span className="text-xs font-medium">{fmtDate(inv.paidAt)}</span></div>}
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="grid grid-cols-[1fr_70px_100px_100px] gap-2 px-4 py-2 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <div>{t("invoices.columns.description")}</div>
              <div className="text-right">{t("invoices.create.qty")}</div>
              <div className="text-right">{t("invoices.create.unitPrice")}</div>
              <div className="text-right">{t("invoices.columns.amount")}</div>
            </div>
            {(inv.items || []).map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_70px_100px_100px] gap-2 px-4 py-2 border-t border-border/20 text-sm items-center">
                <div className="text-foreground">{it.description}</div>
                <div className="text-right tabular-nums text-muted-foreground">{it.quantity}</div>
                <div className="text-right tabular-nums text-muted-foreground">{money(it.unitPrice, inv.currency)}</div>
                <div className="text-right tabular-nums font-medium">{money(it.amount, inv.currency)}</div>
              </div>
            ))}
            {(!inv.items || inv.items.length === 0) && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground border-t border-border/20">{t("invoices.detail.noItems")}</div>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("invoices.create.subtotal")}</span><span className="tabular-nums">{money(inv.subtotal, inv.currency)}</span></div>
              {inv.discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("invoices.create.discount")}</span><span className="tabular-nums">- {money(inv.discount, inv.currency)}</span></div>}
              {inv.taxRate ? <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("invoices.create.tax")} ({Math.round((inv.taxRate || 0) * 100)}%)</span><span className="tabular-nums">{money(inv.taxAmount, inv.currency)}</span></div> : null}
              <div className="flex justify-between text-base font-semibold pt-2 border-t border-border"><span>{t("invoices.create.total")}</span><span className="tabular-nums">{money(inv.total, inv.currency)}</span></div>
            </div>
          </div>

          {inv.notes && (
            <div className="mt-8 pt-4 border-t border-border">
              <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wider mb-1">{t("invoices.create.notes")}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{inv.notes}</p>
            </div>
          )}
        </div>

        {/* Danger / secondary actions */}
        {isAdmin && (
          <div className="flex justify-end gap-2 mt-4">
            {(inv.status === "SENT" || inv.status === "OVERDUE") && (
              <Button variant="ghost" size="sm" className="text-red-600 gap-1.5" onClick={() => statusMutation.mutate("CANCELED")}>
                <XCircle className="size-3.5" /> {t("common.cancel")}
              </Button>
            )}
            {inv.status === "DRAFT" && (
              <Button variant="ghost" size="sm" className="text-red-600 gap-1.5" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                <Trash2 className="size-3.5" /> {t("common.delete")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
