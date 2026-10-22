"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Globe, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { getCountries } from "@/lib/countries"
import { FormField } from "./settings-form-bits"
import type { OrganizationForm } from "./use-organization-profile-form"

/** The organization's postal address: street, line 2, city, state, postal code, country. */
export function GeneralAddressFields({
  form,
  set,
}: {
  form: OrganizationForm
  set: (field: string, value: string) => void
}) {
  const { t } = useTranslation()
  const countryOptions: ComboboxOption[] = useMemo(
    () => getCountries().map((c) => ({ value: c.code, label: c.name, keywords: c.code })),
    [],
  )
  return (
    <>
      <FormField icon={MapPin} label={t("settings.general.streetAddress", "Street address")}>
        <Input
          value={form.addressLine1}
          onChange={(e) => set("addressLine1", e.target.value)}
          placeholder={t("settings.general.streetAddressPlaceholder", "e.g. Arbeiterheimstraße 32")}
          className="h-11 rounded-xl"
        />
      </FormField>

      <FormField label={t("settings.general.addressLine2", "Address line 2 (optional)")}>
        <Input
          value={form.addressLine2}
          onChange={(e) => set("addressLine2", e.target.value)}
          placeholder={t("settings.general.addressLine2Placeholder", "Suite, floor, unit…")}
          className="h-11 rounded-xl"
        />
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField label={t("settings.general.city", "City")}>
          <Input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder={t("settings.general.cityPlaceholder", "e.g. Vienna")}
            className="h-11 rounded-xl"
          />
        </FormField>
        <FormField label={t("settings.general.state", "State / Province / Region")}>
          <Input
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder={t("settings.general.statePlaceholder", "e.g. Upper Austria")}
            className="h-11 rounded-xl"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField label={t("settings.general.postalCode", "Postal / ZIP code")}>
          <Input
            value={form.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            placeholder={t("settings.general.postalCodePlaceholder", "e.g. 4663")}
            className="h-11 rounded-xl"
          />
        </FormField>
        <FormField icon={Globe} label={t("settings.general.country", "Country")}>
          <Combobox
            value={form.country}
            onChange={(v) => set("country", v)}
            options={countryOptions}
            maxResults={countryOptions.length}
            placeholder={t("settings.general.selectCountry", "Select country")}
          />
        </FormField>
      </div>
    </>
  )
}
