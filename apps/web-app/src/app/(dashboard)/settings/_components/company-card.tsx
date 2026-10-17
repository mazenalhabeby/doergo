"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"
import { MoreHorizontal, Pencil, Power, Star } from "lucide-react"
import { invoiceNumberPrefix, issuerAddressLines } from "@hbcfield/shared/client"
import { type LegalEntity, type LegalEntityBankAccount } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CountryChip } from "@/components/companies/company-select"

/**
 * Settings › Companies — the legal entities whose name goes on an invoice or a contract
 * (docs/plans/companies-legal-entities.md). Admins only: this is where clients are told to send
 * money, so every change is audited and the bank details are validated before they are saved.
 */
export const ALL_KEY = keys.companies.includingInactive()

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground break-words">{value}</dd>
    </div>
  )
}

export function bankLine(b: LegalEntityBankAccount): string {
  const parts = [
    b.iban && `IBAN ${b.iban.replace(/(.{4})/g, "$1 ").trim()}`,
    b.bic && `BIC ${b.bic}`,
    b.routingNumber && `Routing ${b.routingNumber}`,
    b.accountNumber && `Acct ${b.accountNumber}`,
  ].filter(Boolean)
  return [b.label || b.bankName, parts.join(" · ")].filter(Boolean).join(" — ")
}

export function CompanyCard({
  company: c,
  year,
  onEdit,
  onMakeMain,
  onToggle,
}: {
  company: LegalEntity
  year: number
  onEdit: () => void
  onMakeMain: () => void
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const address = issuerAddressLines(c).join(", ")
  return (
    <article className={cn("rounded-xl border border-border bg-card p-5", !c.isActive && "opacity-60")}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CountryChip country={c.country} className="h-6 min-w-8 text-[11px]" />
          <div className="min-w-0">
            <h4 className="font-semibold text-foreground truncate">{c.legalName}</h4>
            {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
          </div>
          {c.isMain && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
              {t("companies.main")}
            </span>
          )}
          {!c.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t("companies.off")}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("common.actions", "Actions")}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil className="size-4 mr-2" />{t("common.edit", "Edit")}</DropdownMenuItem>
            {!c.isMain && c.isActive && (
              <DropdownMenuItem onClick={onMakeMain}><Star className="size-4 mr-2" />{t("companies.makeMain")}</DropdownMenuItem>
            )}
            {!c.isMain && (
              <DropdownMenuItem onClick={onToggle}>
                <Power className="size-4 mr-2" />
                {c.isActive ? t("companies.switchOff") : t("companies.switchOn")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <dl className="divide-y divide-border/60">
        <Row label={t("companies.address")} value={address} />
        <Row label={t("companies.vatId")} value={c.vatId} />
        <Row label={t("companies.taxId")} value={c.taxId} />
        <Row label={t("companies.register")} value={c.registerNumber} />
        {(c.bankAccounts ?? []).map((b, i) => (
          <Row key={b.id ?? i} label={i === 0 ? t("companies.bank") : ""} value={bankLine(b)} />
        ))}
        <Row label={t("companies.currency")} value={c.currency || t("companies.orgCurrency")} />
        <Row
          label={t("companies.numbers")}
          value={<span className="font-mono text-[13px] tabular-nums">{invoiceNumberPrefix(c.invoicePrefix, year)}0001</span>}
        />
        {c._count && (c._count.workspaces > 0 || c._count.customers > 0 || c._count.employees > 0) && (
          <Row
            label={t("companies.usedBy")}
            value={t("companies.usedByLine", { workspaces: c._count.workspaces, clients: c._count.customers, people: c._count.employees })}
          />
        )}
      </dl>
    </article>
  )
}

// ─── the form ───────────────────────────────────────────────────────────────

export type Form = {
  legalName: string; label: string; addressLine1: string; addressLine2: string; postalCode: string; city: string
  state: string; country: string; vatId: string; taxId: string; registerNumber: string; email: string; phone: string
  website: string; currency: string | null; invoicePrefix: string; bankAccounts: LegalEntityBankAccount[]
}

export const EMPTY_BANK: LegalEntityBankAccount = {
  label: null,
    holder: null,
    bankName: null,
    iban: null,
    bic: null,
    accountNumber: null,
    routingNumber: null,
    currency: null,
    isDefault: false,
}

export function formOf(c: LegalEntity | null): Form {
  return {
    legalName: c?.legalName ?? "", label: c?.label ?? "", addressLine1: c?.addressLine1 ?? "", addressLine2: c?.addressLine2 ?? "",
    postalCode: c?.postalCode ?? "", city: c?.city ?? "", state: c?.state ?? "", country: c?.country ?? "",
    vatId: c?.vatId ?? "", taxId: c?.taxId ?? "", registerNumber: c?.registerNumber ?? "", email: c?.email ?? "",
    phone: c?.phone ?? "", website: c?.website ?? "", currency: c?.currency ?? null, invoicePrefix: c?.invoicePrefix ?? "INV",
    bankAccounts: (c?.bankAccounts ?? []).map((b) => ({ ...b })),
  }
}

export function BankInput({
  label, value, onChange, placeholder, mono, className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value ?? ""}
        placeholder={placeholder}
        className={mono ? "font-mono" : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  )
}
