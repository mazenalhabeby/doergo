"use client"

import { ChevronDown, ChevronRight } from "lucide-react"
import { AVAILABLE_MODULES, MODULE_GROUPS, MODULE_PRESETS } from "@hbcfield/shared/client"
import { ExplainerButton } from "@/components/explainer/explainer-button"
import { cn } from "@/lib/utils"
import type { SpaceFormState } from "./use-space-form"

/** Part of SpaceForm's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SpaceFormForm({ vm }: { vm: SpaceFormState }) {
  const { setShowAdvanced, showAdvanced, t, enabledModules, setEnabledModules, toggleModule } = vm
  return (
    <div className="rounded-xl border border-border" data-tour="spaces-form-modules">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors rounded-xl"
      >
        <span className="font-medium text-foreground">{t("locations.form.advancedModules")}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("locations.form.enabledCount", { count: enabledModules.length })}
          {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {showAdvanced && (
        <div className="border-t border-border p-3 space-y-3 max-h-[340px] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            {t("locations.form.modulesIntro")}
          </p>

          {/* Presets */}
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
                    onClick={() => setEnabledModules([...p.modules])}
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

          {/* Grouped modules */}
          {MODULE_GROUPS.map((grp) => (
            <div key={grp.key} className="space-y-1">
              <div className="px-1 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grp.label}</p>
                <p className="text-[11px] text-muted-foreground/70">{grp.description}</p>
              </div>
              {AVAILABLE_MODULES.filter((m) => m.group === grp.key).map((mod) => (
                <label
                  htmlFor={`space-module-${mod.key}`}
                  key={mod.key}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <input
                    id={`space-module-${mod.key}`}
                    type="checkbox"
                    checked={enabledModules.includes(mod.key)}
                    onChange={() => toggleModule(mod.key)}
                    className="mt-0.5 rounded border-border text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {mod.label}
                      {/*
                        The row is a <label> around the checkbox, so this button
                        stops its own click — see ExplainerButton. Without that,
                        opening the help also switches the module on.
                      */}
                      <ExplainerButton
                        explainerKey={mod.key}
                        title={mod.label}
                        scope="workspace"
                        enabled={enabledModules.includes(mod.key)}
                      />
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
