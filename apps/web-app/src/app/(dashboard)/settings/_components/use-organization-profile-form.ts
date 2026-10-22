"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { organizationsApi } from "@/lib/api"

/** The organization profile as the General section edits it: the form, seeded once from the server, and its Save. */
export function useOrganizationProfileForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: keys.organization.profile(),
    queryFn: () => organizationsApi.getProfile(),
  })

  const [form, setForm] = useState({
    name: "",
    industry: "",
    phone: "",
    email: "",
    website: "",
    timezone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
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
        name: profile.name ?? "",
        industry: profile.industry ?? "",
        phone: profile.phone ?? "",
        email: profile.email ?? "",
        website: profile.website ?? "",
        timezone: profile.timezone ?? "",
        // Seed structured address; fall back to the legacy single line on line 1.
        addressLine1: profile.addressLine1 ?? profile.address ?? "",
        addressLine2: profile.addressLine2 ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        postalCode: profile.postalCode ?? "",
        country: profile.country ?? "",
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

  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }))

  return { profile, isLoading, form, setForm, updateMutation, set }
}

/** The fields of the General form. */
export type OrganizationForm = ReturnType<typeof useOrganizationProfileForm>["form"]
