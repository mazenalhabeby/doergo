"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { WorkModel } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function WorkModelTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Attendance is ON for any non-NONE value; OFF only for NONE. When the admin
  // turns it ON we persist SHIFT (the reminder-capable model). Members WITH a
  // shift/rota get scheduled reminders; members WITHOUT one stay task-based.
  const current = (space.workModel as WorkModel) || WorkModel.NONE
  const [enabled, setEnabled] = useState(current !== WorkModel.NONE)

  const mutation = useMutation({
    mutationFn: (workModel: WorkModel) => locationsApi.update(space.id, { workModel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("scheduling.workModel.saved"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.workModel.saveFailed")),
  })

  const currentlyOn = current !== WorkModel.NONE
  const hasChanges = enabled !== currentlyOn

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("scheduling.workModel.heading")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("scheduling.workModel.intro")}</p>
      </div>

      {/* Single ON/OFF attendance toggle */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div className="pr-4">
          <p className="text-sm font-semibold text-foreground">{t("scheduling.workModel.attendanceLabel")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {enabled ? t("scheduling.workModel.attendanceOnHint") : t("scheduling.workModel.attendanceOffHint")}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>

      {/* Explain the per-member behavior clearly */}
      <Card className={cn("p-4 border-dashed", enabled ? "bg-blue-50/40 dark:bg-blue-950/20" : "bg-muted/30")}>
        <p className="text-sm font-medium text-foreground">
          {enabled ? t("scheduling.workModel.onTitle") : t("scheduling.workModel.offTitle")}
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
          {enabled ? (
            <>
              <li>{t("scheduling.workModel.onBulletScheduled")}</li>
              <li>{t("scheduling.workModel.onBulletTaskBased")}</li>
            </>
          ) : (
            <li>{t("scheduling.workModel.offBullet")}</li>
          )}
        </ul>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => mutation.mutate(enabled ? WorkModel.SHIFT : WorkModel.NONE)}
          disabled={!hasChanges || mutation.isPending}
        >
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  )
}
