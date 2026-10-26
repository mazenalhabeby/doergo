"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Tag, Building2, Phone, Mail, Link2, Clock, Receipt } from "lucide-react"
import { SettingCard } from "./setting-card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { allTimezones, tzOffset } from "@/lib/timezones"
import { PhoneInput } from "@/components/ui/phone-input"
import { FormField, SaveBar } from "./settings-form-bits"
import { useOrganizationProfileForm } from "./use-organization-profile-form"
import { GeneralAddressFields } from "./general-address-fields"
import { GeneralLogoField } from "./general-logo-field"
import { OrganizationRates } from "./organization-rates"

const INDUSTRY_OPTIONS = [
  "hvac",
  "plumbing",
  "electrical",
  "generalContracting",
  "cleaning",
  "security",
  "itServices",
  "other",
] as const

/** Settings → General: the organization's name, industry, switches, timezone, address, contacts, VAT and rates. */
export function GeneralSection() {
  const { t } = useTranslation()
  const { profile, isLoading, form, setForm, updateMutation, set } = useOrganizationProfileForm()

  const industryOptions: ComboboxOption[] = useMemo(
    () =>
      INDUSTRY_OPTIONS.filter((k) => k !== "other").map((k) => ({
        value: k,
        label: t(`settings.general.industries.${k}`),
      })),
    [t],
  )

  const timezoneOptions: ComboboxOption[] = useMemo(
    () =>
      allTimezones().map((tz) => ({
        value: tz,
        label: `${tz.replace(/_/g, " ")} (${tzOffset(tz)})`,
        keywords: tzOffset(tz),
      })),
    [],
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingCard
        icon={Building2}
        iconColor="text-shell-accent"
        iconBg="bg-shell-accent-soft"
        title={t("settings.general.title")}
        description={t("settings.general.description")}
      >
        <div className="space-y-5">
          <GeneralLogoField profile={profile} />

          <FormField icon={Building2} label={t("settings.general.orgName")}>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("settings.general.orgNamePlaceholder", "e.g. Acme Corporation")}
              className="h-11 rounded-xl"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField icon={Tag} label={t("settings.general.industry")}>
              <Combobox
                value={form.industry}
                onChange={(v) => set("industry", v)}
                options={industryOptions}
                placeholder={t("settings.general.industry")}
                creatable
                createLabel={(q) => t("settings.general.addCustom", { query: q })}
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
                  "Turn on to mark field technicians as in-house or external. In-house " +
                    "field seats are billed at the discounted €9 rate; external at €15. Leave " +
                    "off if all your field techs are the same.",
                )}
              </p>
            </div>
            <Switch
              checked={form.usesExternalWorkers}
              onCheckedChange={(v) => setForm((prev) => ({ ...prev, usesExternalWorkers: v }))}
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
              onCheckedChange={(v) => setForm((prev) => ({ ...prev, crewMode: v }))}
              aria-label={t("settings.general.crewMode.label")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField icon={Clock} label={t("settings.general.timezone")}>
              <Combobox
                value={form.timezone}
                onChange={(v) => set("timezone", v)}
                options={timezoneOptions}
                placeholder={t("settings.general.timezone")}
              />
            </FormField>
          </div>

          <GeneralAddressFields form={form} set={set} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField icon={Phone} label={t("settings.general.phone")}>
              <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} defaultCountry={form.country || "AT"} />
            </FormField>
            <FormField icon={Mail} label={t("settings.general.email")}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder={t("settings.general.emailPlaceholder", "e.g. office@company.com")}
                className="h-11 rounded-xl"
              />
            </FormField>
          </div>

          <FormField icon={Link2} label={t("settings.general.website")}>
            <Input
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder={t("settings.general.websitePlaceholder", "https://www.company.com")}
              className="h-11 rounded-xl"
            />
          </FormField>

          {/* Invoicing details — shown on invoices; billable rate auto-prices labor lines. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField icon={Receipt} label={t("settings.general.vatId", "VAT / UID number")}>
              <Input
                value={form.vatId}
                onChange={(e) => set("vatId", e.target.value)}
                placeholder={t("settings.general.vatIdPlaceholder", "e.g. ATU12345678")}
                className="h-11 rounded-xl"
              />
            </FormField>
          </div>
          <OrganizationRates profile={profile} />

          <SaveBar onSave={() => updateMutation.mutate({ ...form })} isPending={updateMutation.isPending} t={t} />
        </div>
      </SettingCard>
    </div>
  )
}
