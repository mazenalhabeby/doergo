"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Blocks, Sparkles, Plus, Minus } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { AVAILABLE_MODULES, MODULE_GROUPS, MODULE_PRESETS, moduleI18n, moduleRequires, resolveModuleDependencies } from "@hbcfield/shared/client"

/** The English source for each module, used as the fallback for its key. */
const MODULE_LABEL: Record<string, string> = Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.key, m.label]))
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SectionHeader } from "./section-header"

export function ModulesTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const saved = (space.enabledModules as string[] | null) || []
  const [enabledModules, setEnabledModules] = useState<string[]>(saved)

  const mutation = useMutation({
    mutationFn: (modules: string[]) => locationsApi.update(space.id, { enabledModules: modules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("locations.toast.modulesUpdated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.modulesUpdateFailed")),
  })

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
                {t(moduleI18n.presetLabel(p.key), { defaultValue: p.label })}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grouped modules with a one-line description per group */}
      {MODULE_GROUPS.map((grp) => (
        <div key={grp.key} className="space-y-2">
          <div className="px-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(moduleI18n.groupLabel(grp.key), { defaultValue: grp.label })}</p>
            <p className="text-[11px] text-muted-foreground/70">{t(moduleI18n.groupDescription(grp.key), { defaultValue: grp.description })}</p>
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
                  <span className="text-sm font-medium text-foreground">{t(moduleI18n.label(mod.key), { defaultValue: mod.label })}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(moduleI18n.description(mod.key), { defaultValue: mod.description })}</p>
                  {locked && (
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1">
                      🔒 {t("locations.moduleRequires", "Requires {{modules}}", { modules: unmet.map((r) => t(moduleI18n.label(r), { defaultValue: MODULE_LABEL[r] || r })).join(", ") })}
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

      {/* Sticky unsaved-changes bar — always visible while there are pending
          edits, no matter how long the list. Shows the exact diff so nobody
          thinks a toggle auto-saved. */}
      {dirty && (
        <div className="sticky bottom-3 z-20 pt-2">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t("locations.unsavedCount", "{{count}} unsaved change", { count: added.length + removed.length })}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {added.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <Plus className="h-3 w-3" />{t(moduleI18n.label(m), { defaultValue: MODULE_LABEL[m] || m })}
                  </span>
                ))}
                {removed.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    <Minus className="h-3 w-3" />{t(moduleI18n.label(m), { defaultValue: MODULE_LABEL[m] || m })}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEnabledModules(saved)} disabled={mutation.isPending}>
                {t("common.discard", "Discard")}
              </Button>
              <Button size="sm" onClick={() => mutation.mutate(enabledModules)} disabled={mutation.isPending}>
                {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
