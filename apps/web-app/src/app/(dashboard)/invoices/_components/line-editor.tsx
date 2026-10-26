"use client"

import type { ReactNode } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { money } from "./invoice-document"
import { CompanySelect, companyName, useCompanies } from "@/components/companies/company-select"

/** Who it is for. `extra` is where a screen adds its own offer under the name. */
export function ClientFields({
  clientName,
  setClientName,
  clientEmail,
  setClientEmail,
  clientAddress,
  setClientAddress,
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
    <div className="overflow-hidden rounded-[22px] border border-border bg-card shadow-shell">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Button
          variant="ghost"
          size="sm"
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
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}

/**
 * "Issued by" — the company whose name, address and bank go on this invoice. `value` null =
 * automatic (the workspace's → the client's → the main company), and `autoId` names which one
 * that is right now. Renders nothing while the organization has a single company.
 */
export function IssuedByField({
  value,
  onChange,
  autoId,
  frozen,
}: {
  value: string | null
  onChange: (id: string | null) => void
  autoId?: string | null
  /** Issued: the company is frozen on the invoice and can no longer be changed. */
  frozen?: boolean
}) {
  const { t } = useTranslation()
  const { companies, main, hasSeveral } = useCompanies()
  if (!hasSeveral) return null
  const auto = companies.find((c) => c.id === autoId) ?? main
  return (
    <div>
      <Label className="text-xs" htmlFor="inv-company">
        {t("companies.invoiceIssuedBy")}
      </Label>
      <CompanySelect
        id="inv-company"
        value={value}
        onChange={onChange}
        inheritLabel={t("companies.sameAsDefault", { name: companyName(auto) })}
        disabled={frozen}
        className="mt-1 h-9 rounded-md"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {frozen ? t("companies.invoiceIssuedFrozen") : t("companies.invoiceIssuedByHelp")}
      </p>
    </div>
  )
}
