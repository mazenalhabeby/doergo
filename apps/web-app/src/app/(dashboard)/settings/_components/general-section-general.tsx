"use client"

import {
  Loader2,
  Tag,
  Building2,
  Globe,
  Phone,
  Mail,
  Link2,
  MapPin,
  Clock,
  Image as ImageIcon,
  Upload,
  Trash2,
  Receipt,
} from "lucide-react"
import { SettingCard } from "./setting-card"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/ui/combobox"
import { PhoneInput } from "@/components/ui/phone-input"
import { FormField, SaveBar } from "./settings-form-bits"
import type { GeneralSectionState } from "./use-general-section"

/** Part of GeneralSection's markup, moved here unchanged; it reads the page's state from `vm`. */
export function GeneralSectionGeneral({ vm }: { vm: GeneralSectionState }) {
  const {
    t,
    profile,
    logoBusy,
    onLogoPick,
    saveLogo,
    form,
    set,
    industryOptions,
    setForm,
    timezoneOptions,
    countryOptions,
    orgRates,
    saveOrgRate,
    refreshUser,
    updateMutation,
  } = vm
  return (
    <SettingCard
      icon={Building2}
      iconColor="text-blue-600"
      iconBg="bg-blue-50"
      title={t("settings.general.title")}
      description={t("settings.general.description")}
    >
      <div className="space-y-5">
        <FormField icon={ImageIcon} label={t("settings.general.logo", "Company logo")}>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-xl border border-border bg-muted/40 grid place-items-center overflow-hidden">
              {profile?.logoUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img
                  src={profile.logoUrl}
                  alt="Logo"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
                : <ImageIcon className="h-6 w-6 text-muted-foreground/50" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <label
                  className={cn(
                    ("inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border " +
                      "border-border text-sm font-medium cursor-pointer hover:bg-accent/50 " +
                      "transition-colors"),
                    logoBusy && "opacity-60 pointer-events-none")}>
                  {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {profile?.logoUrl ? t("settings.general.logoReplace", "Replace") : t("settings.general.logoUpload", "Upload logo")}
                  <input type="file" accept="image/*" className="hidden" disabled={logoBusy}
                    onChange={e => { onLogoPick(e.target.files?.[0]); e.target.value = "" }} />
                </label>
                {profile?.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 text-red-600 hover:text-red-700" disabled={logoBusy} onClick={() => saveLogo("")}>
                    <Trash2 className="h-3.5 w-3.5" />{t("settings.general.logoRemove", "Remove")}
                  </Button>
                )}
              </div>
              <p
                className="text-xs text-muted-foreground mt-1.5">{t(
                  "settings.general.logoHint",
                  "PNG or JPG. Shows on report & statement PDFs. Saved instantly.")}</p>
            </div>
          </div>
        </FormField>

        <FormField icon={Building2} label={t("settings.general.orgName")}>
          <Input
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder={t("settings.general.orgNamePlaceholder", "e.g. Acme Corporation")}
            className="h-11 rounded-xl"
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField icon={Tag} label={t("settings.general.industry")}>
            <Combobox
              value={form.industry}
              onChange={v => set("industry", v)}
              options={industryOptions}
              placeholder={t("settings.general.industry")}
              creatable
              createLabel={q => t("settings.general.addCustom", { query: q })}
            />
          </FormField>
        </div>

        {/* Opt-in: only orgs that mix employed + freelance field workers turn
            this on; when off, the whole in-house/external concept is hidden. */}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("settings.general.externalWorkers.label", "We use external / freelance field workers")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "settings.general.externalWorkers.hint",
                ("Turn on to mark field technicians as in-house or external. In-house " + "field seats are billed at the discounted €9 rate; external at €15. Leave " + "off if all your field techs are the same."),
              )}
            </p>
          </div>
          <Switch
            checked={form.usesExternalWorkers}
            onCheckedChange={v => setForm(prev => ({ ...prev, usesExternalWorkers: v }))}
          />
        </div>

        {/* Crew rules: off keeps today's behaviour; on once the phones run the app with the crew controls. */}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("settings.general.crewMode.label")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.general.crewMode.hint")}</p>
          </div>
          <Switch
            checked={form.crewMode}
            onCheckedChange={v => setForm(prev => ({ ...prev, crewMode: v }))}
            aria-label={t("settings.general.crewMode.label")}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          <FormField icon={Clock} label={t("settings.general.timezone")}>
            <Combobox
              value={form.timezone}
              onChange={v => set("timezone", v)}
              options={timezoneOptions}
              placeholder={t("settings.general.timezone")}
            />
          </FormField>
        </div>

        <FormField icon={MapPin} label={t("settings.general.streetAddress", "Street address")}>
          <Input
            value={form.addressLine1}
            onChange={e => set("addressLine1", e.target.value)}
            placeholder={t("settings.general.streetAddressPlaceholder", "e.g. Arbeiterheimstraße 32")}
            className="h-11 rounded-xl"
          />
        </FormField>

        <FormField label={t("settings.general.addressLine2", "Address line 2 (optional)")}>
          <Input
            value={form.addressLine2}
            onChange={e => set("addressLine2", e.target.value)}
            placeholder={t("settings.general.addressLine2Placeholder", "Suite, floor, unit…")}
            className="h-11 rounded-xl"
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label={t("settings.general.city", "City")}>
            <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder={t("settings.general.cityPlaceholder", "e.g. Vienna")} className="h-11 rounded-xl" />
          </FormField>
          <FormField label={t("settings.general.state", "State / Province / Region")}>
            <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder={t("settings.general.statePlaceholder", "e.g. Upper Austria")} className="h-11 rounded-xl" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label={t("settings.general.postalCode", "Postal / ZIP code")}>
            <Input value={form.postalCode} onChange={e => set("postalCode", e.target.value)} placeholder={t("settings.general.postalCodePlaceholder", "e.g. 4663")} className="h-11 rounded-xl" />
          </FormField>
          <FormField icon={Globe} label={t("settings.general.country", "Country")}>
            <Combobox
              value={form.country}
              onChange={v => set("country", v)}
              options={countryOptions}
              maxResults={countryOptions.length}
              placeholder={t("settings.general.selectCountry", "Select country")}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField icon={Phone} label={t("settings.general.phone")}>
            <PhoneInput
              value={form.phone}
              onChange={v => set("phone", v)}
              defaultCountry={form.country || "AT"}
            />
          </FormField>
          <FormField icon={Mail} label={t("settings.general.email")}>
            <Input
              type="email"
              value={form.email}
              onChange={e => set("email", e.target.value)}
              placeholder={t("settings.general.emailPlaceholder", "e.g. office@company.com")}
              className="h-11 rounded-xl"
            />
          </FormField>
        </div>

        <FormField icon={Link2} label={t("settings.general.website")}>
          <Input
            value={form.website}
            onChange={e => set("website", e.target.value)}
            placeholder={t("settings.general.websitePlaceholder", "https://www.company.com")}
            className="h-11 rounded-xl"
          />
        </FormField>

        {/* Invoicing details — shown on invoices; billable rate auto-prices labor lines. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField icon={Receipt} label={t("settings.general.vatId", "VAT / UID number")}>
            <Input
              value={form.vatId}
              onChange={e => set("vatId", e.target.value)}
              placeholder={t("settings.general.vatIdPlaceholder", "e.g. ATU12345678")}
              className="h-11 rounded-xl"
            />
          </FormField>
        </div>
        {/*
          ⚠️ Rates are NOT part of this form's Save. Each one changes from a
          day and keeps its history, so it has its own Change button that asks
          from when — a Save button that rewrote it "from today" every time the
          address was edited would re-price nothing, but would bury the date
          the rate really changed.
        */}
        {/*
          The organization's currency: what workers' own rates, statements and
          margins are in, and what a workspace or client without one bills in.
          Its own Change button for the same reason as the rates below — a
          switch re-reads every rate set at this level.
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrencySetting
            id="org-currency"
            label={t("currency.orgLabel")}
            hint={t("currency.orgHint")}
            value={profile?.currency ?? "EUR"}
            ratesSet={orgRates?.filter((r) => r.cents != null).length ?? 0}
            onSave={async (code) => {
              await saveOrgRate({ currency: code })
              await refreshUser()
            }}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatedRateField
            id="org-bill-rate"
            label={t("rates.orgBill")}
            hint={t("rates.orgBillHint")}
            currentCents={profile?.billableRateCents ?? null}
            currency={profile?.currency ?? undefined}
            history={orgRates?.filter((r) => r.kind === "BILL_HOUR")}
            onSubmit={(c, from) => saveOrgRate({ billableRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })}
          />
          <DatedRateField
            id="org-cost-rate"
            label={t("rates.orgCost")}
            hint={t("rates.orgCostHint")}
            currentCents={profile?.costRateCents ?? null}
            currency={profile?.currency ?? undefined}
            history={orgRates?.filter((r) => r.kind === "COST_HOUR")}
            onSubmit={(c, from) => saveOrgRate({ costRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })}
          />
        </div>

        <SaveBar
          onSave={() => updateMutation.mutate({ ...form })}
          isPending={updateMutation.isPending}
          t={t}
        />
      </div>
    </SettingCard>
  )
}
