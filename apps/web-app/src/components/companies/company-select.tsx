"use client"

import { useMemo } from "react"
import { LEGAL_ENTITY_READ_KEYS } from "@/lib/org-letterhead"
import { useQuery } from "@tanstack/react-query"
import { bankForInvoice, issuerSnapshotOf, type IssuerSnapshot } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { legalEntitiesApi, type LegalEntity } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * COMPANIES — the legal entities whose name goes on an invoice or a contract.
 *
 * One query for the whole app (`["legal-entities"]`), read by every picker. The server decides
 * who may list them (and strips the bank accounts from anyone who does not invoice); this only
 * avoids asking when the answer is a refusal.
 */
export const COMPANIES_QUERY_KEY = ["legal-entities"] as const

// One list with the letterhead rule — the permissions GET /legal-entities accepts.
const READ_PERMISSIONS = LEGAL_ENTITY_READ_KEYS

export function useCompanies() {
  const { user, hasPermission } = useAuth()
  const allowed = !!user && READ_PERMISSIONS.some((p) => hasPermission(p))
  const query = useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => legalEntitiesApi.list(),
    enabled: allowed,
    staleTime: 5 * 60_000,
  })
  const companies = query.data ?? []
  return {
    ...query,
    companies,
    main: companies.find((c) => c.isMain) ?? null,
    /** One company is the normal case — then no screen asks "issued by" at all. */
    hasSeveral: companies.length > 1,
  }
}

/** "HBC USA" when a short label is set, else the legal name. */
export function companyName(c: Pick<LegalEntity, "legalName" | "label"> | null | undefined): string {
  return c ? c.label || c.legalName : ""
}

/** The two-letter country as a quiet monochrome chip — never a flag. */
export function CountryChip({ country, className }: { country?: string | null; className?: string }) {
  if (!country) return null
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-7 items-center justify-center rounded-md border border-border px-1 text-[10px] font-semibold tracking-wide text-muted-foreground",
        className,
      )}
    >
      {country}
    </span>
  )
}

const INHERIT = "__inherit__"

/** One choice in a company picker — what the picker draws, nothing more. */
export interface CompanyOption {
  id: string
  name: string
  isMain: boolean
  country?: string | null
}

/**
 * The picker itself, fed its choices — for a screen whose server already sent the list
 * (the job report's `meta.issuers`), so it needs no permission to list companies.
 * `null` = "follow the default" (`inheritLabel` says which one).
 */
export function CompanyOptionSelect({
  id,
  companies,
  value,
  onChange,
  inheritLabel,
  disabled,
  className,
}: {
  id?: string
  companies: readonly CompanyOption[]
  value: string | null | undefined
  onChange: (id: string | null) => void
  /** Shown first; choosing it sends null. Omit to force a choice. */
  inheritLabel?: string
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  // A chosen company that has since been switched off still shows what is saved.
  const known = !value || companies.some((c) => c.id === value)
  return (
    <Select
      value={value ?? (inheritLabel ? INHERIT : undefined)}
      onValueChange={(v) => onChange(v === INHERIT ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={t("companies.choose")} />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel && <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>}
        {!known && value && <SelectItem value={value}>{t("companies.switchedOff")}</SelectItem>}
        {companies.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <CountryChip country={c.country} />
              <span>{c.name}</span>
              {c.isMain && <span className="text-xs text-muted-foreground">· {t("companies.main")}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Choose the company. `null` = "follow the default" (`inheritLabel` says which one), so a
 * workspace or client that never picked keeps following the main company if it changes.
 */
export function CompanySelect(props: {
  id?: string
  value: string | null | undefined
  onChange: (id: string | null) => void
  /** Shown first; choosing it sends null. Omit to force a choice. */
  inheritLabel?: string
  disabled?: boolean
  className?: string
}) {
  const { companies } = useCompanies()
  const options = useMemo(
    () => companies.map((c) => ({ id: c.id, name: companyName(c), isMain: c.isMain, country: c.country })),
    [companies],
  )
  return <CompanyOptionSelect {...props} companies={options} />
}

/**
 * The whole "Invoices issued by" field — label, picker, one line of help. Renders NOTHING while
 * the organization has a single company, so nobody is asked a question with one answer.
 */
export function CompanyField({
  id,
  label,
  help,
  value,
  onChange,
  inheritLabel,
  disabled,
}: {
  id: string
  label: string
  help?: string
  value: string | null | undefined
  onChange: (id: string | null) => void
  inheritLabel?: string
  disabled?: boolean
}) {
  const { hasSeveral } = useCompanies()
  if (!hasSeveral && !value) return null
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <CompanySelect id={id} value={value} onChange={onChange} inheritLabel={inheritLabel} disabled={disabled} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

/**
 * What a DRAFT's letterhead and "Pay to" read: the chosen company, live, with the account in the
 * invoice's currency — the same shape the server freezes on issue, so the preview IS the document.
 */
export function useIssuerPreview(companyId: string | null | undefined, currency: string | null): IssuerSnapshot | null {
  const { companies } = useCompanies()
  return useMemo(() => {
    const c = companies.find((x) => x.id === companyId)
    if (!c) return null
    const bank = bankForInvoice(c.bankAccounts ?? [], currency)
    const { bankAccounts: _b, isMain: _m, isActive: _a, _count: _c, ...identity } = c
    void _b; void _m; void _a; void _c
    return issuerSnapshotOf(
      identity,
      bank
        ? { label: bank.label, holder: bank.holder, bankName: bank.bankName, iban: bank.iban, bic: bank.bic, accountNumber: bank.accountNumber, routingNumber: bank.routingNumber, currency: bank.currency }
        : null,
    )
  }, [companies, companyId, currency])
}
