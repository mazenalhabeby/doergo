"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { allTimezones, tzOffset } from "@/lib/timezones"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { organizationsApi, rateHistoryApi } from "@/lib/api"
import { type ComboboxOption } from "@/components/ui/combobox"
import { getCountries } from "@/lib/countries"
import { resizeImageToDataUrl } from "../_lib/resize-image"

export const INDUSTRY_OPTIONS = [
  "hvac", "plumbing", "electrical", "generalContracting",
  "cleaning", "security", "itServices", "other",
] as const

/** GeneralSection's state and handlers — everything before its markup, moved here unchanged. */
export function useGeneralSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()

  const { data: profile, isLoading } = useQuery({
    queryKey: keys.organization.profile(),
    queryFn: () => organizationsApi.getProfile(),
  })

  const [form, setForm] = useState({
    name: "", industry: "", phone: "", email: "", website: "", timezone: "",
    addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "",
    // Invoicing: VAT/UID for the invoice header + default billable rate (euros/hour).
    vatId: "",
    // Opt-in capability: distinguish in-house vs external field workers.
    usesExternalWorkers: false as boolean,
    // Crew rules (shared tasks/crew.ts): only a job's leader moves its step.
    crewMode: false as boolean,
  })
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (profile && !initialized) {
      setForm({
        name: profile.name ?? "", industry: profile.industry ?? "",
        phone: profile.phone ?? "", email: profile.email ?? "",
        website: profile.website ?? "", timezone: profile.timezone ?? "",
        // Seed structured address; fall back to the legacy single line on line 1.
        addressLine1: profile.addressLine1 ?? profile.address ?? "",
        addressLine2: profile.addressLine2 ?? "",
        city: profile.city ?? "", state: profile.state ?? "",
        postalCode: profile.postalCode ?? "", country: profile.country ?? "",
        vatId: profile.vatId ?? "",
        usesExternalWorkers: profile.usesExternalWorkers ?? false,
        crewMode: profile.crewMode ?? false,
      })
      setInitialized(true)
    }
  }, [profile, initialized])

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => organizationsApi.updateProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
      notify.success(t("settings.general.saved"))
    },
    onError: (error: Error) => notify.error(error.message || t("settings.general.failed")),
  })

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  // The organization's own rates and their history — saved on their own, from a day.
  const { data: orgRates } = useQuery({
    queryKey: keys.rates.history("ORGANIZATION", profile?.id),
    queryFn: () => rateHistoryApi.list({ target: "ORGANIZATION", targetId: profile!.id! }),
    enabled: !!profile?.id,
  })
  const saveOrgRate = async (patch: Record<string, unknown>) => {
    await organizationsApi.updateProfile(patch)
    queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("ORGANIZATION") })
  }

  const [logoBusy, setLogoBusy] = useState(false)
  const saveLogo = async (logoUrl: string) => {
    setLogoBusy(true)
    try {
      await organizationsApi.updateProfile({ logoUrl })
      queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
      notify.success(logoUrl ? t("settings.general.logoSaved", "Logo updated") : t("settings.general.logoRemoved", "Logo removed"))
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("settings.general.failed"))
    } finally { setLogoBusy(false) }
  }
  const onLogoPick = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) { notify.error(t("settings.general.logoType", "Please choose an image file")); return }
    setLogoBusy(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400)
      await saveLogo(dataUrl)
    } catch {
      setLogoBusy(false)
      notify.error(t("settings.general.logoFailed", "Could not process that image"))
    }
  }

  const industryOptions: ComboboxOption[] = useMemo(
    () =>
      INDUSTRY_OPTIONS.filter(k => k !== "other").map(k => ({
        value: k,
        label: t(`settings.general.industries.${k}`),
      })),
    [t],
  )

  const timezoneOptions: ComboboxOption[] = useMemo(
    () =>
      allTimezones().map(tz => ({
        value: tz,
        label: `${tz.replace(/_/g, " ")} (${tzOffset(tz)})`,
        keywords: tzOffset(tz),
      })),
    [],
  )

  const countryOptions: ComboboxOption[] = useMemo(
    () => getCountries().map(c => ({ value: c.code, label: c.name, keywords: c.code })),
    [],
  )

  return {
    t,
    refreshUser,
    profile,
    isLoading,
    form,
    setForm,
    updateMutation,
    set,
    orgRates,
    saveOrgRate,
    logoBusy,
    saveLogo,
    onLogoPick,
    industryOptions,
    timezoneOptions,
    countryOptions,
  }
}

/** What GeneralSection and its sections read. */
export type GeneralSectionState = ReturnType<typeof useGeneralSection>
