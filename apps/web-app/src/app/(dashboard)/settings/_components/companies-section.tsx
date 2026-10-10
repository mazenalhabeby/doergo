"use client"

import { useId, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Building2, MoreHorizontal, Pencil, Plus, Power, Star, Trash2 } from "lucide-react"
import { invoiceNumberPrefix, issuerAddressLines, MAX_BANK_ACCOUNTS } from "@hbcfield/shared/client"

import { legalEntitiesApi, type LegalEntity, type LegalEntityBankAccount, type LegalEntityInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { keys } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import { getCountries } from "@/lib/countries"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CurrencySelect } from "@/components/rates/currency-setting"
import { COMPANIES_QUERY_KEY, CountryChip } from "@/components/companies/company-select"
import { SettingCard } from "./setting-card"

/**
 * Settings › Companies — the legal entities whose name goes on an invoice or a contract
 * (docs/plans/companies-legal-entities.md). Admins only: this is where clients are told to send
 * money, so every change is audited and the bank details are validated before they are saved.
 */
const ALL_KEY = keys.companies.includingInactive()

export function CompaniesSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: companies, isLoading } = useQuery({
    queryKey: ALL_KEY,
    queryFn: () => legalEntitiesApi.list({ includeInactive: true }),
  })
  const [editing, setEditing] = useState<LegalEntity | "new" | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY })
  const makeMain = useMutation({
    mutationFn: (id: string) => legalEntitiesApi.setMain(id),
    onSuccess: () => { refresh(); notify.success(t("companies.madeMain")) },
    onError: (e) => notify.error(serverErrorMessage(e, t)),
  })
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => legalEntitiesApi.setActive(id, active),
    onSuccess: (_d, v) => { refresh(); notify.success(v.active ? t("companies.switchedOn") : t("companies.switchedOffDone")) },
    onError: (e) => notify.error(serverErrorMessage(e, t)),
  })

  const year = new Date().getFullYear()

  return (
    <div className="space-y-6">
      <SettingCard
        icon={Building2}
        iconColor="text-foreground"
        iconBg="bg-muted"
        title={t("companies.title")}
        description={t("companies.subtitle")}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <p className="text-sm text-muted-foreground max-w-prose">{t("companies.explain")}</p>
          <Button size="sm" onClick={() => setEditing("new")} className="shrink-0">
            <Plus className="size-4 mr-1.5" />
            {t("companies.add")}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(companies ?? []).map((c) => (
              <CompanyCard
                key={c.id}
                company={c}
                year={year}
                onEdit={() => setEditing(c)}
                onMakeMain={() => makeMain.mutate(c.id)}
                onToggle={() => setActive.mutate({ id: c.id, active: !c.isActive })}
              />
            ))}
          </div>
        )}
      </SettingCard>

      {editing && (
        <CompanyDialog
          company={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground break-words">{value}</dd>
    </div>
  )
}

function bankLine(b: LegalEntityBankAccount): string {
  const parts = [
    b.iban && `IBAN ${b.iban.replace(/(.{4})/g, "$1 ").trim()}`,
    b.bic && `BIC ${b.bic}`,
    b.routingNumber && `Routing ${b.routingNumber}`,
    b.accountNumber && `Acct ${b.accountNumber}`,
  ].filter(Boolean)
  return [b.label || b.bankName, parts.join(" · ")].filter(Boolean).join(" — ")
}

function CompanyCard({
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

type Form = {
  legalName: string; label: string; addressLine1: string; addressLine2: string; postalCode: string; city: string
  state: string; country: string; vatId: string; taxId: string; registerNumber: string; email: string; phone: string
  website: string; currency: string | null; invoicePrefix: string; bankAccounts: LegalEntityBankAccount[]
}

const EMPTY_BANK: LegalEntityBankAccount = {
  label: null, holder: null, bankName: null, iban: null, bic: null, accountNumber: null, routingNumber: null, currency: null, isDefault: false,
}

function formOf(c: LegalEntity | null): Form {
  return {
    legalName: c?.legalName ?? "", label: c?.label ?? "", addressLine1: c?.addressLine1 ?? "", addressLine2: c?.addressLine2 ?? "",
    postalCode: c?.postalCode ?? "", city: c?.city ?? "", state: c?.state ?? "", country: c?.country ?? "",
    vatId: c?.vatId ?? "", taxId: c?.taxId ?? "", registerNumber: c?.registerNumber ?? "", email: c?.email ?? "",
    phone: c?.phone ?? "", website: c?.website ?? "", currency: c?.currency ?? null, invoicePrefix: c?.invoicePrefix ?? "INV",
    bankAccounts: (c?.bankAccounts ?? []).map((b) => ({ ...b })),
  }
}

function CompanyDialog({ company, onClose, onSaved }: { company: LegalEntity | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState<Form>(() => formOf(company))
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const countries = useMemo(() => getCountries().map((c) => ({ value: c.code, label: c.name, keywords: c.code })), [])
  const year = new Date().getFullYear()

  const save = useMutation({
    mutationFn: () => {
      const body: LegalEntityInput = {
        ...f,
        currency: f.currency,
        bankAccounts: f.bankAccounts.map((b) => ({ ...b, id: undefined })),
      }
      return company ? legalEntitiesApi.update(company.id, body) : legalEntitiesApi.create(body)
    },
    onSuccess: () => { notify.success(t("companies.saved")); onSaved() },
    onError: (e) => notify.error(serverErrorMessage(e, t)),
  })

  const setBank = (i: number, patch: Partial<LegalEntityBankAccount>) =>
    set("bankAccounts", f.bankAccounts.map((b, j) => (j === i ? { ...b, ...patch } : patch.isDefault ? { ...b, isDefault: false } : b)))

  const text = (k: keyof Form, label: string, opts?: { placeholder?: string; className?: string; mono?: boolean }) => (
    <div className={cn("space-y-1.5", opts?.className)}>
      <Label htmlFor={`co-${k}`}>{label}</Label>
      <Input
        id={`co-${k}`}
        value={(f[k] as string) ?? ""}
        placeholder={opts?.placeholder}
        className={opts?.mono ? "font-mono" : undefined}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? t("companies.editTitle") : t("companies.addTitle")}</DialogTitle>
          <DialogDescription>{t("companies.formHelp")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        >
          <section className="grid gap-4 sm:grid-cols-2">
            {text("legalName", t("companies.legalName"), { className: "sm:col-span-2", placeholder: "HBC USA Inc." })}
            {text("label", t("companies.shortLabel"), { placeholder: "USA" })}
            <div className="space-y-1.5">
              <Label>{t("companies.country")}</Label>
              <Combobox value={f.country} onChange={(v) => set("country", v)} options={countries} placeholder={t("companies.chooseCountry")} />
            </div>
            {text("addressLine1", t("companies.street"), { className: "sm:col-span-2" })}
            {text("addressLine2", t("companies.street2"), { className: "sm:col-span-2" })}
            {text("postalCode", t("companies.postalCode"))}
            {text("city", t("companies.city"))}
            {text("state", t("companies.state"))}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            {text("vatId", t("companies.vatId"), { placeholder: "ATU12345678" })}
            {text("taxId", t("companies.taxId"), { placeholder: "12-3456789" })}
            {text("registerNumber", t("companies.register"), { className: "sm:col-span-2" })}
            {text("email", t("companies.email"))}
            {text("phone", t("companies.phone"))}
            {text("website", t("companies.website"), { className: "sm:col-span-2" })}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("companies.currency")}</Label>
              <CurrencySelect value={f.currency} onChange={(v) => set("currency", v)} inheritFrom="org" inheritLabel={t("companies.orgCurrency")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-invoicePrefix">{t("companies.prefix")}</Label>
              <Input
                id="co-invoicePrefix"
                className="font-mono uppercase"
                maxLength={8}
                value={f.invoicePrefix}
                onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                {t("companies.prefixHelp", { example: `${invoiceNumberPrefix(f.invoicePrefix || "INV", year)}0001` })}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t("companies.bankAccounts")}</h4>
              {f.bankAccounts.length < MAX_BANK_ACCOUNTS && (
                <Button type="button" variant="outline" size="sm" onClick={() => set("bankAccounts", [...f.bankAccounts, { ...EMPTY_BANK, isDefault: f.bankAccounts.length === 0 }])}>
                  <Plus className="size-4 mr-1" />{t("companies.addBank")}
                </Button>
              )}
            </div>
            {f.bankAccounts.length === 0 && <p className="text-sm text-muted-foreground">{t("companies.noBank")}</p>}
            {f.bankAccounts.map((b, i) => (
              <div key={i} className="rounded-xl border border-border p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <BankInput label={t("companies.bankLabel")} value={b.label} onChange={(v) => setBank(i, { label: v })} placeholder="USD account" />
                  <BankInput label={t("companies.bankName")} value={b.bankName} onChange={(v) => setBank(i, { bankName: v })} />
                  <BankInput label={t("companies.holder")} value={b.holder} onChange={(v) => setBank(i, { holder: v })} className="sm:col-span-2" />
                  <BankInput label="IBAN" value={b.iban} onChange={(v) => setBank(i, { iban: v })} mono />
                  <BankInput label="BIC / SWIFT" value={b.bic} onChange={(v) => setBank(i, { bic: v })} mono />
                  <BankInput label={t("companies.accountNumber")} value={b.accountNumber} onChange={(v) => setBank(i, { accountNumber: v })} mono />
                  <BankInput label={t("companies.routing")} value={b.routingNumber} onChange={(v) => setBank(i, { routingNumber: v })} mono />
                  <div className="space-y-1.5">
                    <Label>{t("companies.bankCurrency")}</Label>
                    <CurrencySelect value={b.currency} onChange={(v) => setBank(i, { currency: v })} inheritFrom="any" inheritLabel={t("companies.anyCurrency")} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="default-bank" checked={b.isDefault} onChange={() => setBank(i, { isDefault: true })} />
                    {t("companies.defaultBank")}
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("bankAccounts", f.bankAccounts.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4 mr-1" />{t("common.remove", "Remove")}
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t("companies.bankHelp")}</p>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
            <Button type="submit" disabled={save.isPending || !f.legalName.trim()}>{t("common.save", "Save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BankInput({
  label, value, onChange, placeholder, mono, className,
}: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string; mono?: boolean; className?: string }) {
  const id = useId()
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} placeholder={placeholder} className={mono ? "font-mono" : undefined} onChange={(e) => onChange(e.target.value || null)} />
    </div>
  )
}
