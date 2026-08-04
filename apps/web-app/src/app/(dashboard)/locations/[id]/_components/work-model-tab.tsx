"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { WorkModel } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const WORK_MODEL_ORDER: WorkModel[] = [WorkModel.NONE, WorkModel.SHIFT, WorkModel.FIXED, WorkModel.TASK]

// Models that drive shift reminders / attendance expectations.
const REMINDER_MODELS = new Set<WorkModel>([WorkModel.SHIFT, WorkModel.FIXED])

export function WorkModelTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const current = (space.workModel as WorkModel) || WorkModel.NONE
  const [selected, setSelected] = useState<WorkModel>(current)

  const mutation = useMutation({
    mutationFn: (workModel: WorkModel) => locationsApi.update(space.id, { workModel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("scheduling.workModel.saved"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.workModel.saveFailed")),
  })

  const hasChanges = selected !== current

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("scheduling.workModel.heading")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("scheduling.workModel.intro")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {WORK_MODEL_ORDER.map((model) => {
          const isSelected = selected === model
          return (
            <button
              key={model}
              type="button"
              onClick={() => setSelected(model)}
              className={cn(
                "text-left rounded-xl border p-4 transition-colors",
                isSelected
                  ? "border-blue-500 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30"
                  : "border-border hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {t(`scheduling.workModel.options.${model}.label`)}
                </span>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t(`scheduling.workModel.options.${model}.description`)}
              </p>
              {REMINDER_MODELS.has(model) && (
                <Badge
                  variant="outline"
                  className="mt-2.5 text-[11px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {t("scheduling.workModel.remindersBadge")}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      <Card className="p-3 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">{t("scheduling.workModel.remindersNote")}</p>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate(selected)} disabled={!hasChanges || mutation.isPending}>
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  )
}
