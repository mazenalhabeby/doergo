"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { AVAILABLE_MODULES, MODULE_GROUPS, MODULE_PRESETS } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
      const next = prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
      setHasChanges(true)
      return next
    })
  }

  const applyPreset = (modules: string[]) => {
    setEnabledModules([...modules])
    setHasChanges(true)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("locations.modulesIntro")}</p>

      {/* Presets — one click to set a sensible bundle */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("locations.presets")}</p>
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
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
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
            return (
              <label
                key={mod.key}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  isEnabled
                    ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <span className="text-sm font-medium text-foreground">{mod.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                </div>
                <div className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleModule(mod.key)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
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
