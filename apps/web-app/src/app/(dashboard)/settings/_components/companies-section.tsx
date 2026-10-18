"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Building2, Plus, Trash2 } from "lucide-react"
import { invoiceNumberPrefix, MAX_BANK_ACCOUNTS } from "@hbcfield/shared/client"

import { legalEntitiesApi, type LegalEntity, type LegalEntityBankAccount, type LegalEntityInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { getCountries } from "@/lib/countries"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CurrencySelect } from "@/components/rates/currency-setting"
import { COMPANIES_QUERY_KEY } from "@/components/companies/company-select"
import { SettingCard } from "./setting-card"
import { ALL_KEY, CompanyCard, type Form, EMPTY_BANK, formOf, BankInput } from "./company-card"

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
              <Combobox
                value={f.country}
                onChange={(v) => set("country", v)}
                options={countries}
                placeholder={t("companies.chooseCountry")}
              />
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
              <CurrencySelect
                value={f.currency}
                onChange={(v) => set("currency", v)}
                inheritFrom="org"
                inheritLabel={t("companies.orgCurrency")}
              />
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set("bankAccounts", [...f.bankAccounts, { ...EMPTY_BANK, isDefault: f.bankAccounts.length === 0 }])}>
                  <Plus className="size-4 mr-1" />{t("companies.addBank")}
                </Button>
              )}
            </div>
            {f.bankAccounts.length === 0 && <p className="text-sm text-muted-foreground">{t("companies.noBank")}</p>}
            {f.bankAccounts.map((b, i) => (
              <div key={i} className="rounded-xl border border-border p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <BankInput
                    label={t("companies.bankLabel")}
                    value={b.label}
                    onChange={(v) => setBank(i, { label: v })}
                    placeholder="USD account"
                  />
                  <BankInput label={t("companies.bankName")} value={b.bankName} onChange={(v) => setBank(i, { bankName: v })} />
                  <BankInput
                    label={t("companies.holder")}
                    value={b.holder}
                    onChange={(v) => setBank(i, { holder: v })}
                    className="sm:col-span-2"
                  />
                  <BankInput label="IBAN" value={b.iban} onChange={(v) => setBank(i, { iban: v })} mono />
                  <BankInput label="BIC / SWIFT" value={b.bic} onChange={(v) => setBank(i, { bic: v })} mono />
                  <BankInput
                    label={t("companies.accountNumber")}
                    value={b.accountNumber}
                    onChange={(v) => setBank(i, { accountNumber: v })}
                    mono
                  />
                  <BankInput
                    label={t("companies.routing")}
                    value={b.routingNumber}
                    onChange={(v) => setBank(i, { routingNumber: v })}
                    mono
                  />
                  <div className="space-y-1.5">
                    <Label>{t("companies.bankCurrency")}</Label>
                    <CurrencySelect
                      value={b.currency}
                      onChange={(v) => setBank(i, { currency: v })}
                      inheritFrom="any"
                      inheritLabel={t("companies.anyCurrency")}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="default-bank" checked={b.isDefault} onChange={() => setBank(i, { isDefault: true })} />
                    {t("companies.defaultBank")}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set("bankAccounts", f.bankAccounts.filter((_, j) => j !== i))}>
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
