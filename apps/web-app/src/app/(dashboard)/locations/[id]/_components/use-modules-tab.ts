"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { assetsApi, locationsApi, type CompanyLocation } from "@/lib/api"
import {
  moduleRequires,
  resolveModuleDependencies,
  spaceMonthlyCost,
  billsByUsage,
} from "@hbcfield/shared/client"

/** ModulesTab's state and handlers — everything before its markup, moved here unchanged. */
export function useModulesTab({ space }: Pick<{ space: CompanyLocation }, 'space'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const saved = (space.enabledModules as string[] | null) || []
  const [enabledModules, setEnabledModules] = useState<string[]>(saved)

  const mutation = useMutation({
    mutationFn: (modules: string[]) => locationsApi.update(space.id, { enabledModules: modules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
      notify.success(t("locations.toast.modulesUpdated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.modulesUpdateFailed")),
  })

  /*
    What this space costs, from what is switched on at this moment.

    Read from `enabledModules` — the unsaved state — not from the space record,
    because the question somebody is asking while toggling is "what will this
    cost me", and answering it only after they press Save is answering it too
    late. The saved figure is shown next to it when the two differ.
  */
  const liveCost = spaceMonthlyCost(enabledModules)
  const savedCost = spaceMonthlyCost(saved)
  const costChanged = liveCost.monthlyCents !== savedCost.monthlyCents

  /*
    The counted modules — assets, CRM clients, portals — need numbers the
    toggles cannot supply.

    One request covers all three, fetched only when at least one of them is in
    play, so a space that touches none of them never pays for the query. Counts
    come back per space; this screen uses its own, because the base price, the
    free allowance and the ladder are all per space.
  */
  const usageModules = enabledModules.filter(billsByUsage)
  const { data: usageData } = useQuery({
    queryKey: keys.assets.usage(),
    queryFn: () => assetsApi.getUsage(),
    enabled: usageModules.length > 0,
    staleTime: 60000,
  })

  /*
    This space's count for a module. Falls back to the top-level asset numbers
    so a client still reads the right figure against a server that predates
    `modules` — during a rolling deploy that is a real window, and the wrong
    answer here is a wrong price on screen rather than a broken page.
  */
  const unitsFor = (key: string) =>
    usageData?.modules?.[key]?.spaces?.[space.id] ??
    (key === "assets" ? usageData?.spaces?.[space.id] ?? 0 : 0)

  const usageUnits = Object.fromEntries(usageModules.map((k) => [k, unitsFor(k)]))

  // What this space really costs: its switches plus what its own counts add.
  const liveUsageCents = spaceMonthlyCost(enabledModules, usageUnits).usageMonthlyCents

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => {
      if (prev.includes(key)) {
        // Disabling: also drop anything that depends on it (e.g. crm off → b2c off).
        return resolveModuleDependencies(prev.filter((m) => m !== key))
      }
      // Enabling: pull in its prerequisites too.
      return Array.from(new Set([...prev, key, ...moduleRequires(key)]))
    })
  }

  const applyPreset = (modules: string[]) => {
    setEnabledModules(resolveModuleDependencies([...modules]))
  }

  // Live diff vs. the saved set — drives the sticky "unsaved changes" bar and
  // shows the office exactly what they turned on/off before saving.
  const added = enabledModules.filter((m) => !saved.includes(m))
  const removed = saved.filter((m) => !enabledModules.includes(m))
  const dirty = added.length > 0 || removed.length > 0

  return {
    t,
    saved,
    enabledModules,
    setEnabledModules,
    mutation,
    liveCost,
    savedCost,
    costChanged,
    usageModules,
    usageData,
    unitsFor,
    liveUsageCents,
    toggleModule,
    applyPreset,
    added,
    removed,
    dirty,
  }
}
