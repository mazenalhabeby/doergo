"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { NO_SHIFT_LIMIT, WORK_PRESETS, formatDuration, type WorkPreset } from "@hbcfield/shared/client"
import { locationsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * "Works here as" — how THIS member works at this workspace when it differs from the workspace (clock review
 * D1): the same as the workspace, or one of the three ways with their own hours a day. Anybody set differently
 * carries "Own rules". Saves through the same route as the away override (`canManageWorkspaces`).
 */
const OWN_TAG = "rounded-full bg-shell-chip px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"

export function WorkAsRow({
  locationId,
  assignmentId,
  workAs,
  workDailyMinutes,
  canManage,
}: {
  locationId: string
  assignmentId: string
  workAs?: string | null
  workDailyMinutes?: number | null
  canManage?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const current = (WORK_PRESETS as readonly string[]).includes(workAs ?? "") ? (workAs as WorkPreset) : null
  const [hours, setHours] = useState(workDailyMinutes ?? null)
  const own = current !== null || workDailyMinutes != null

  const save = useMutation({
    mutationFn: (body: { workAs?: WorkPreset | null; workDailyMinutes?: number | null }) =>
      locationsApi.updateAssignment(locationId, assignmentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.memberRecord.assignments() })
      qc.invalidateQueries({ queryKey: keys.locations.rosterBatches() })
      notify.success(t("workPreset.saved", "Saved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const options: { value: WorkPreset | null; label: string }[] = [
    { value: null, label: t("workPreset.sameAsWorkspace", "Same as workspace") },
    ...WORK_PRESETS.map((p) => ({ value: p, label: t(`workPreset.${p}.title`) })),
  ]
  const step = (delta: number) => {
    const base = hours ?? NO_SHIFT_LIMIT.DEFAULT_MINUTES
    const next = Math.min(NO_SHIFT_LIMIT.MAX_MINUTES, Math.max(NO_SHIFT_LIMIT.MIN_MINUTES, base + delta))
    setHours(next)
    save.mutate({ workDailyMinutes: next })
  }

  return (
    <div className="mt-3.5 rounded-lg border border-border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground">{t("workPreset.worksHereAs", "Works here as")}</span>
        {own && <span className={OWN_TAG}>{t("workPreset.ownRules", "Own rules")}</span>}
      </div>
      {canManage ? (
        <>
          <div className="mt-2 flex flex-wrap overflow-hidden rounded-md border border-border">
            {options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate({ workAs: o.value })}
                className={cn(
                  "flex-1 px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
                  current === o.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t("workPreset.ownHours", "Hours a day without a shift")}</span>
            <div className="inline-flex items-center overflow-hidden rounded-md border bg-background">
              <button
                type="button"
                className="px-2 py-0.5 hover:bg-muted"
                disabled={save.isPending}
                onClick={() => step(-30)}
              >
                −
              </button>
              <span className="px-2 tabular-nums text-foreground">
                {hours != null ? formatDuration(hours) : t("workPreset.sameAsWorkspace", "Same as workspace")}
              </span>
              <button
                type="button"
                className="px-2 py-0.5 hover:bg-muted"
                disabled={save.isPending}
                onClick={() => step(30)}
              >
                +
              </button>
            </div>
            {hours != null && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setHours(null)
                  save.mutate({ workDailyMinutes: null })
                }}
              >
                {t("workPreset.useWorkspaceHours", "Use the workspace's")}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {current ? t(`workPreset.${current}.title`) : t("workPreset.sameAsWorkspace", "Same as workspace")}
          {workDailyMinutes != null ? ` · ${formatDuration(workDailyMinutes)}` : ""}
        </p>
      )}
    </div>
  )
}
