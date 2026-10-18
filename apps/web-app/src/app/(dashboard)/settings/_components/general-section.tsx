"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { useGeneralSection } from "./use-general-section"
import { GeneralSectionGeneral } from "./general-section-general"

export function GeneralSection() {
  const vm = useGeneralSection()
  const {
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
  } = vm

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GeneralSectionGeneral vm={vm} />
    </div>
  )
}
