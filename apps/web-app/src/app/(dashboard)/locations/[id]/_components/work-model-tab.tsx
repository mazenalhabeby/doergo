"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, CheckCircle2, MinusCircle } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { WorkModel } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { SectionHeader } from "./section-header"

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
      <SectionHeader
        icon={CalendarClock}
        accent="indigo"
        title={t("scheduling.workModel.heading")}
        description={t("scheduling.workModel.intro")}
      />

      {/* Single ON/OFF attendance toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <div className="pr-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{t("scheduling.workModel.attendanceLabel")}</p>
            {enabled ? (
              <Badge className="gap-1 border-transparent bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3" />
                {t("scheduling.workModel.attendanceOnBadge")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                <MinusCircle className="h-3 w-3" />
                {t("scheduling.workModel.attendanceOffBadge")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {enabled ? t("scheduling.workModel.attendanceOnHint") : t("scheduling.workModel.attendanceOffHint")}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} className="shrink-0" />
      </div>

      {/* Explain the per-member behavior clearly */}
      <Card
        className={cn(
          "p-4 border-dashed",
          enabled ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20" : "bg-muted/30",
        )}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {enabled ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <MinusCircle className="h-4 w-4 text-muted-foreground" />
          )}
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
