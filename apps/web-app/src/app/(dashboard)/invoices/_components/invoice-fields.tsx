"use client"

import type { ReactNode } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { money } from "./invoice-document"

/**
 * The controls both invoice screens need, in the form the rail requires.
 *
 * ⚠️ ONE COLUMN, EVERYWHERE. These blocks were written for a full-width form
 * and carried `sm:grid-cols-2` into a 320px rail — where "Issue date" wrapped
 * onto two lines, "Rate (per hour)" onto three, and the currency box showed
 * "EUF". `sm:` asks about the VIEWPORT; what is narrow here is the CONTAINER,
 * and no breakpoint can tell the difference. A layout is not portable just
 * because it is responsive.
 *
 * ⚠️ And the app's own DatePicker, never `<input type="date">`. The native
 * control renders differently in every browser and in a narrow column shows
 * "dd.m" with a clipped spinner. The edit screen still had two of them.
 */

/** Who it is for. `extra` is where a screen adds its own offer under the name. */
export function ClientFields({
  clientName, setClientName,
  clientEmail, setClientEmail,
  clientAddress, setClientAddress,
  extra,
}: {
  clientName: string
  setClientName: (v: string) => void
  clientEmail: string
  setClientEmail: (v: string) => void
  clientAddress: string
  setClientAddress: (v: string) => void
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{t("invoices.create.clientName")} *</Label>
        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 h-9" />
        {extra}
      </div>
      <div>
        <Label className="text-xs">{t("invoices.create.clientEmail")}</Label>
        <Input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder={t("invoices.create.clientEmailPlaceholder")}
          className="mt-1 h-9"
        />
      </div>
      <div>
        <Label className="text-xs">{t("invoices.create.clientAddress")}</Label>
        {/*
          A textarea, because an address is not one line. It went onto the
          client's copy as a single squeezed input, so anybody who typed a real
          one saw it truncated in a 60px box.
        */}
        <Textarea
          value={clientAddress}
          onChange={(e) => setClientAddress(e.target.value)}
          rows={2}
          placeholder={t("invoices.create.clientAddressPlaceholder")}
          className="mt-1 resize-none text-sm"
        />
      </div>
    </div>
  )
}

/**
 * Dates, currency, tax and discount.
 *
 * ⚠️ NOT "WHO IT IS FOR". They sat in that card because the old full-width
 * layout had room for a second column and something had to fill it. A section
 * called "who it is for" that also sets the tax rate is one somebody has to
 * read twice to use once.
 */
export function TermsFields({
  issueDate, setIssueDate,
  dueDate, setDueDate,
  currency, setCurrency,
  taxPct, setTaxPct,
  discount, setDiscount,
  children,
}: {
  issueDate: string
  setIssueDate: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  currency: string
  setCurrency: (v: string) => void
  taxPct: string
  setTaxPct: (v: string) => void
  discount: string
  setDiscount: (v: string) => void
  /** A screen's own term — the fallback hourly rate, on the create side. */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {/*
        Stacked, not side by side: two calendar triggers in a 320px rail leave
        no room for either date to be readable.
      */}
      <div>
        <Label className="text-xs" htmlFor="inv-issue">{t("invoices.create.issueDate")}</Label>
        <DatePicker id="inv-issue" value={issueDate} onChange={setIssueDate} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs" htmlFor="inv-due">{t("invoices.create.dueDate")}</Label>
        <DatePicker
          id="inv-due"
          value={dueDate}
          onChange={setDueDate}
          placeholder={t("invoices.create.noDueDate")}
          clearable
          /* A due date before the invoice was issued is not a term, it is a
             typo — and one nobody re-reads on a draft. */
          fromDate={issueDate ? new Date(issueDate) : undefined}
          className="mt-1"
        />
      </div>

      {children}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t("invoices.create.currency")}</Label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            className="mt-1 h-9 uppercase tabular-nums"
            maxLength={3}
          />
        </div>
        <div>
          <Label className="text-xs">{t("invoices.create.taxRate")}</Label>
          <Input
            type="number" min={0} value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            className="mt-1 h-9 tabular-nums"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">{t("invoices.create.discount")}</Label>
        <Input
          type="number" min={0} value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          className="mt-1 h-9 tabular-nums"
        />
      </div>
    </div>
  )
}

/** A line somebody is typing. Strings, because a half-typed number is a string. */
export interface EditableLine {
  /** Present for lines that exist server-side; absent for ones added here. */
  id?: string
  description: string
  quantity: string
  unitPrice: string
}

/** `"3,5"` → 3.5, and anything unusable → 0 rather than NaN on the document. */
export function num(s: string | number) {
  const n = Number(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/**
 * Lines typed by hand.
 *
 * ⚠️ ONE EDITOR FOR BOTH SCREENS — the extra lines on a new invoice and the
 * whole of a draft being corrected are the same control over the same shape.
 * The edit screen had its own, four inputs wide with a different column order
 * and a different amount format, on a page where the amounts were the point.
 */
export function LineEditor({
  title,
  lines,
  onChange,
  currency,
  emptyLabel,
}: {
  title: string
  lines: EditableLine[]
  onChange: (lines: EditableLine[]) => void
  currency: string
  emptyLabel: string
}) {
  const { t } = useTranslation()
  const setLine = (i: number, patch: Partial<EditableLine>) =>
    onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)))

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Button
          variant="ghost" size="sm"
          className="h-7 gap-1.5 text-muted-foreground"
          onClick={() => onChange([...lines, { description: "", quantity: "1", unitPrice: "0" }])}
        >
          <Plus className="size-3.5" /> {t("invoices.create.addLine")}
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="py-5 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        lines.map((l, i) => (
          <div
            key={l.id ?? `new-${i}`}
            className="grid grid-cols-[1fr_70px_100px_100px_32px] items-center gap-2 border-b border-border/20 px-4 py-2"
          >
            <Input
              aria-label={t("invoices.create.descriptionCol")}
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder={t("invoices.create.descriptionPlaceholder")}
              className="h-8 text-sm"
            />
            <Input
              aria-label={t("invoices.create.qty")}
              inputMode="decimal"
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
              className="h-8 text-right text-sm tabular-nums"
            />
            <Input
              aria-label={t("invoices.create.unitPrice")}
              inputMode="decimal"
              value={l.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              className="h-8 text-right text-sm tabular-nums"
            />
            <span className="text-right text-sm font-medium tabular-nums">
              {money(num(l.quantity) * num(l.unitPrice), currency)}
            </span>
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => onChange(lines.filter((_, n) => n !== i))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}
