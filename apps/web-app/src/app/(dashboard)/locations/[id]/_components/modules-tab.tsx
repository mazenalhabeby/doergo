"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Blocks, Sparkles } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { AVAILABLE_MODULES, MODULE_GROUPS, MODULE_PRESETS, moduleRequires, resolveModuleDependencies } from "@hbcfield/shared/client"

const MODULE_LABEL: Record<string, string> = Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.key, m.label]))
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SectionHeader } from "./section-header"

export function ModulesTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [enabledModules, setEnabledModules] = useState<string[]>(space.enabledModules || [])
  const [hasChanges, setHasChanges] = useState(false)

  const mutation = useMutation({
    mutationFn: (modules: string[]) => locationsApi.update(space.id, { enabledModules: modules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("locations.toast.modulesUpdated"))
      setHasChanges(false)
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.modulesUpdateFailed")),
  })

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => {
      let next: string[]
      if (prev.includes(key)) {
        // Disabling: also drop anything that depends on it (e.g. crm off → b2c off).
        next = resolveModuleDependencies(prev.filter((m) => m !== key))
      } else {
        // Enabling: pull in its prerequisites too.
        next = Array.from(new Set([...prev, key, ...moduleRequires(key)]))
      }
      setHasChanges(true)
      return next
    })
  }

  const applyPreset = (modules: string[]) => {
    setEnabledModules(resolveModuleDependencies([...modules]))
    setHasChanges(true)
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

      {/* Presets — one click to set a sensible bundle */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {t("locations.presets")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MODULE_PRESETS.map((p) => {
            const active =
              p.modules.length === enabledModules.length &&
              p.modules.every((m) => enabledModules.includes(m))
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.modules)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grouped modules with a one-line description per group */}
      {MODULE_GROUPS.map((grp) => (
        <div key={grp.key} className="space-y-2">
          <div className="px-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grp.label}</p>
            <p className="text-[11px] text-muted-foreground/70">{grp.description}</p>
          </div>
          {AVAILABLE_MODULES.filter((m) => m.group === grp.key).map((mod) => {
            const isEnabled = enabledModules.includes(mod.key)
            const unmet = moduleRequires(mod.key).filter((r) => !enabledModules.includes(r))
            const locked = !isEnabled && unmet.length > 0
            return (
              <label
                key={mod.key}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-colors",
                  isEnabled
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : "border-border hover:bg-muted/50",
                  locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <span className="text-sm font-medium text-foreground">{mod.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                  {locked && (
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1">
                      🔒 {t("locations.moduleRequires", "Requires {{modules}}", { modules: unmet.map((r) => MODULE_LABEL[r] || r).join(", ") })}
                    </p>
                  )}
                </div>
                <div className="relative inline-flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={locked}
                    onChange={() => toggleModule(mod.key)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-emerald-600 peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </div>
              </label>
            )
          })}
        </div>
      ))}

      {hasChanges && (
        <div className="flex justify-end pt-2">
          <Button onClick={() => mutation.mutate(enabledModules)} disabled={mutation.isPending} size="sm">
            {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </div>
      )}
    </div>
  )
}
