"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarRange, Clock, Loader2, MapPinned } from "lucide-react"
import { PRESET_RULES, WORK_PRESETS, presetOfWorkspace, type WorkPreset } from "@hbcfield/shared/client"
import type { CompanyLocation } from "@hbcfield/shared"
import { locationsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

const ICON: Record<WorkPreset, typeof Clock> = {
  FIXED_SHIFTS: CalendarRange,
  FLEXIBLE_HOURS: Clock,
  IN_THE_FIELD: MapPinned,
}

/**
 * "How do people work here?" — one question instead of the separate settings (clock review D1). Each answer
 * writes the columns the clock already reads (shared `PRESET_RULES`); "Change details" below still opens every
 * one, and a workspace whose details were changed reads as Custom. Saves on click.
 */
export function WorkPresetPicker({
  space,
  onScheduledChange,
}: {
  space: CompanyLocation
  /** The rota panels show for a workspace that works in shifts. */
  onScheduledChange: (scheduled: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [current, setCurrent] = useState(presetOfWorkspace(space as never))

  const save = useMutation({
    mutationFn: (preset: WorkPreset) => locationsApi.update(space.id, { ...PRESET_RULES[preset] } as never),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      qc.invalidateQueries({ queryKey: keys.locations.lists() })
      notify.success(t("workPreset.saved", "Saved"))
    },
    onError: (err: Error) => {
      setCurrent(presetOfWorkspace(space as never))
      notify.error(err.message || t("workPreset.failed", "Could not save"))
    },
  })

  const choose = (preset: WorkPreset) => {
    if (preset === current || save.isPending) return
    setCurrent(preset)
    onScheduledChange(PRESET_RULES[preset].workModel === "SHIFT")
    save.mutate(preset)
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{t("workPreset.question", "How do people work here?")}</p>
      <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {WORK_PRESETS.map((p) => {
          const Icon = ICON[p]
          const on = current === p
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(p)}
              disabled={save.isPending}
              className={cn(
                "rounded-xl border p-4 text-left transition-all disabled:opacity-70",
                on
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                  : "border-border hover:border-muted-foreground/30",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="h-4 w-4 text-blue-600" /> {t(`workPreset.${p}.title`)}
                {on && save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t(`workPreset.${p}.desc`)}</p>
            </button>
          )
        })}
      </div>
      {current === "CUSTOM" && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {t("workPreset.custom", "Custom — the details below were changed. Choose a way above to reset them.")}
        </p>
      )}
    </div>
  )
}
