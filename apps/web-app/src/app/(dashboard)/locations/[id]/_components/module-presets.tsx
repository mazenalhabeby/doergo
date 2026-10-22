"use client"

import { useTranslation } from "react-i18next"
import { Sparkles } from "lucide-react"
import { MODULE_PRESETS, moduleI18n } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

/** One click to set a sensible bundle; the preset matching what is switched on now is highlighted. */
export function ModulePresets({
  enabledModules,
  applyPreset,
}: {
  enabledModules: string[]
  applyPreset: (modules: string[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        {t("locations.presets")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {MODULE_PRESETS.map((p) => {
          const active =
            p.modules.length === enabledModules.length && p.modules.every((m) => enabledModules.includes(m))
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.modules)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 " +
                      "dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {t(moduleI18n.presetLabel(p.key), { defaultValue: p.label })}
            </button>
          )
        })}
      </div>
    </div>
  )
}
