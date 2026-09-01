"use client"

import { PlanGate } from "@/components/plan-gate"
import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice, type InvoiceItem } from "@/lib/api"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

/*
  Correcting a draft invoice.

  The API has had `PATCH /invoices/:id` and item add/remove since invoicing
  shipped; there was simply no screen. So the only way to fix a wrong quantity
  or a misspelled client was to delete the invoice and build it again from
  scratch — losing the number, and tempting people to send something wrong
  rather than redo the work.

  DRAFT only, deliberately. A sent invoice is an accounting record: the way to
  change one is to cancel it and issue another, which the detail page already
  offers. Anything else quietly rewrites a document a customer is holding.

  Not built on the `new` page. That screen exists to DERIVE lines from recorded
  work — gather, rates, per-worker summaries — and none of that applies to
  correcting lines that already exist. Sharing it would drag a builder into a
  form.
*/

/** A line as it is being edited: strings, because a half-typed number is a string. */
type DraftLine = {
  /** Present for lines that exist server-side; absent for ones added here. */
  id?: string
  description: string
  quantity: string
  unitPrice: string
}

const toLine = (i: InvoiceItem): DraftLine => ({
  id: i.id,
  description: i.description,
  quantity: String(i.quantity),
  unitPrice: String(i.unitPrice),
})

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/** Same shape the server stores, so a line is only "changed" when it really is. */
const sameLine = (a: DraftLine, b: InvoiceItem) =>
  a.description.trim() === b.description &&
  num(a.quantity) === b.quantity &&
  num(a.unitPrice) === b.unitPrice

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PlanGate feature="invoicing">
      <EditInvoiceInner id={id} />
    </PlanGate>
  )
}

function EditInvoiceInner({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoicesApi.getById(id),
  })

  const [clientName, setClientName] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientAddress, setClientAddress] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [taxPct, setTaxPct] = useState("")
  const [discount, setDiscount] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [seeded, setSeeded] = useState(false)

  // Seeded once. Re-seeding on every render of a refetched query would discard
  // whatever the person had typed.
  useEffect(() => {
    if (!inv || seeded) return
    setClientName(inv.clientName ?? "")
    setClientEmail(inv.clientEmail ?? "")
    setClientAddress(inv.clientAddress ?? "")
    setIssueDate(inv.issueDate ? inv.issueDate.slice(0, 10) : "")
    setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "")
    setTaxPct(inv.taxRate != null ? String(inv.taxRate * 100) : "")
    setDiscount(String(inv.discount ?? 0))
    setNotes(inv.notes ?? "")
    setLines((inv.items ?? []).map(toLine))
    setSeeded(true)
  }, [inv, seeded])

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0),
    [lines],
  )
  const taxAmount = subtotal * (num(taxPct) / 100)
  const total = subtotal + taxAmount - num(discount)

  const money = (n: number) => {
    try {
      return new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: inv?.currency || "EUR",
      }).format(n || 0)
    } catch {
      return `${(n || 0).toFixed(2)} ${inv?.currency ?? ""}`
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!inv) return
      const original = inv.items ?? []

      /*
        Items first, then the header.

        Both halves recalculate: adding or removing a line recomputes the
        subtotal, and changing tax or discount recomputes the total from the
        subtotal it finds. Doing the header first would apply the new tax rate
        to the OLD subtotal and leave the invoice wrong by exactly the
        difference — which is the kind of error nobody notices until a customer
        does.
      */
      const kept = new Set(lines.filter((l) => l.id).map((l) => l.id as string))

      for (const item of original) {
        const edited = lines.find((l) => l.id === item.id)
        // Removed outright, or changed — there is no item PATCH, so a change is
        // a remove followed by an add.
        if (!kept.has(item.id) || (edited && !sameLine(edited, item))) {
          await invoicesApi.removeItem(inv.id, item.id)
        }
      }

      for (const line of lines) {
        const item = line.id ? original.find((i) => i.id === line.id) : null
        const isNew = !item
        const isChanged = item && !sameLine(line, item)
        if (isNew || isChanged) {
          await invoicesApi.addItem(inv.id, {
            description: line.description.trim(),
            quantity: num(line.quantity),
            unitPrice: num(line.unitPrice),
          })
        }
      }

      await invoicesApi.update(inv.id, {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        issueDate: issueDate || undefined,
        // Cleared on purpose stays cleared: the PDF then reads "On receipt"
        // rather than inventing a term nobody agreed.
        dueDate: dueDate || undefined,
        taxRate: taxPct.trim() === "" ? undefined : num(taxPct) / 100,
        discount: num(discount),
        notes: notes.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] })
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      notify.success(t("invoices.toast.updated", "Invoice updated"))
      router.push(`/invoices/${id}`)
    },
    onError: (e) => notify.error(errorMessage(e)),
  })

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))

  if (isLoading || !inv) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  // Same gate the detail page uses for its destructive actions.
  const canEdit = user?.role === "ADMIN" && inv.status === "DRAFT"

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {t(
            "invoices.edit.onlyDrafts",
            "Only a draft invoice can be edited. Cancel this one and issue another instead.",
          )}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/invoices/${id}`)}>
          {t("common.back", "Back")}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-8 flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 h-9 w-9 text-muted-foreground"
            onClick={() => router.push(`/invoices/${id}`)}
            aria-label={t("common.back", "Back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("invoices.edit.title", "Edit invoice")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{inv.invoiceNumber}</p>
          </div>
        </div>

        {/* ── Who it is for ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border/80 bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("invoices.edit.billTo", "Bill to")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="clientName">{t("invoices.fields.clientName", "Client name")}</Label>
              <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="clientEmail">{t("invoices.fields.clientEmail", "Email")}</Label>
              <Input id="clientEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="clientAddress">{t("invoices.fields.clientAddress", "Address")}</Label>
              <Input id="clientAddress" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="mt-1.5" />
            </div>
          </div>
        </section>

        {/* ── Dates ────────────────────────────────────────────────────── */}
        <section className="mt-4 rounded-xl border border-border/80 bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="issueDate">{t("invoices.fields.issueDate", "Issue date")}</Label>
              <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="dueDate">{t("invoices.fields.dueDate", "Due date")}</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("invoices.edit.dueHint", "Leave empty and the invoice reads “Due on receipt”.")}
              </p>
            </div>
          </div>
        </section>

        {/* ── Lines ────────────────────────────────────────────────────── */}
        <section className="mt-4 rounded-xl border border-border/80 bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t("invoices.edit.lines", "Line items")}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "0" }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("invoices.edit.addLine", "Add line")}
            </Button>
          </div>

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("invoices.edit.noLines", "This invoice has no lines yet.")}
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.id ?? `new-${i}`} className="flex items-start gap-2">
                  <Input
                    aria-label={t("invoices.fields.description", "Description")}
                    placeholder={t("invoices.fields.description", "Description")}
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    aria-label={t("invoices.fields.quantity", "Qty")}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    className="w-20 text-right tabular-nums"
                  />
                  <Input
                    aria-label={t("invoices.fields.unitPrice", "Unit price")}
                    inputMode="decimal"
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    className="w-28 text-right tabular-nums"
                  />
                  <div className="w-28 pt-2 text-right text-sm tabular-nums text-muted-foreground">
                    {money(num(l.quantity) * num(l.unitPrice))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-9 w-9 text-red-600"
                    aria-label={t("common.delete")}
                    onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Totals ───────────────────────────────────────────────────── */}
        <section className="mt-4 rounded-xl border border-border/80 bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="taxPct">{t("invoices.fields.taxRate", "Tax %")}</Label>
              <Input id="taxPct" inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="discount">{t("invoices.fields.discount", "Discount")}</Label>
              <Input id="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="mt-5 space-y-1.5 border-t border-border/60 pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t("invoices.fields.subtotal", "Subtotal")}</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t("invoices.fields.tax", "Tax")}</span>
              <span className="tabular-nums">{money(taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold text-foreground">
              <span>{t("invoices.fields.total", "Total")}</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </div>
        </section>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        <section className="mt-4 rounded-xl border border-border/80 bg-card p-5">
          <Label htmlFor="notes">{t("invoices.fields.notes", "Notes")}</Label>
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" />
        </section>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push(`/invoices/${id}`)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={save.isPending || !clientName.trim()} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("common.save", "Save")}
          </Button>
        </div>
      </div>
    </div>
  )
}
