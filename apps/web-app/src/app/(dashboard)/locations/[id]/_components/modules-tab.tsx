"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Blocks } from "lucide-react"
import {
  AVAILABLE_MODULES,
  MODULE_GROUPS,
  moduleI18n,
  moduleRequires,
  resolveModuleDependencies,
  spaceMonthlyCost,
  billsByUsage,
} from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { assetsApi, locationsApi, type CompanyLocation } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { SectionHeader } from "../../../../../components/common/section-header"
import { ModuleUsageTabs } from "./module-usage-tabs"
import { ModuleRow } from "./module-row"
import { SpaceCostSummary } from "./space-cost-summary"
import { UnsavedModulesBar } from "./unsaved-modules-bar"
import { ModulePresets } from "./module-presets"

/** A workspace's modules: what it costs, the counted modules' usage, presets, and one switch per module. */
export function ModulesTab({ space }: { space: CompanyLocation }) {
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
    usageData?.modules?.[key]?.spaces?.[space.id] ?? (key === "assets" ? (usageData?.spaces?.[space.id] ?? 0) : 0)

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

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Blocks}
        accent="emerald"
        title={t("locations.tabs.modules")}
        description={t("locations.modulesIntro")}
        action={
          <Badge variant="secondary" className="gap-1">
            <Blocks className="h-3 w-3" />
            {t("locations.modulesEnabledCount", { count: enabledModules.length })}
          </Badge>
        }
      />

      {/*
        What this space costs, updating as modules are toggled.

        Stated before the list rather than after it: the price is the reason to
        hesitate over a switch, and a total underneath a long list is read after
        the decision instead of during it.
      */}
      <SpaceCostSummary
        enabledModules={enabledModules}
        saved={saved}
        usageModules={usageModules}
        liveUsageCents={liveUsageCents}
      />

      {/* The counted modules, priced in full. Directly under the space total,
          because that total is only their BASE and a number that is not the
          whole number has to be followed immediately by the rest of it. */}
      {usageData && <ModuleUsageTabs moduleKeys={usageModules} unitsFor={unitsFor} />}

      {/* Presets — one click to set a sensible bundle */}
      <ModulePresets enabledModules={enabledModules} applyPreset={applyPreset} />

      {/* Grouped modules with a one-line description per group */}
      {MODULE_GROUPS.map((grp) => (
        <div key={grp.key} className="space-y-2">
          <div className="px-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(moduleI18n.groupLabel(grp.key), { defaultValue: grp.label })}
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {t(moduleI18n.groupDescription(grp.key), { defaultValue: grp.description })}
            </p>
          </div>
          {AVAILABLE_MODULES.filter((m) => m.group === grp.key).map((mod) => (
            <ModuleRow
              key={mod.key}
              mod={mod}
              enabledModules={enabledModules}
              hasUsage={!!usageData}
              unitsFor={unitsFor}
              toggleModule={toggleModule}
            />
          ))}
        </div>
      ))}

      {/* Sticky unsaved-changes bar — always visible while there are pending
          edits, no matter how long the list. Shows the exact diff so nobody
          thinks a toggle auto-saved. */}
      <UnsavedModulesBar
        saved={saved}
        enabledModules={enabledModules}
        setEnabledModules={setEnabledModules}
        saving={mutation.isPending}
        onSave={(modules) => mutation.mutate(modules)}
      />
    </div>
  )
}
