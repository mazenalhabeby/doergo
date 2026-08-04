"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, CalendarRange, Clock, Loader2, MapPin, Users } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { WorkModel } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { SectionHeader } from "./section-header"
import { ShiftsTab } from "./shifts-tab"
import { RotaTab } from "./rota-tab"

/**
 * Attendance — one tab that replaces the old Work-model + Shifts + Rota trio.
 *
 * Industry frame (Deputy / When I Work / Rippling): the time clock is universal
 * (everyone with the Clock module tracks time). Scheduling is an OPTIONAL layer
 * on top — a space is either "Open hours" (free clock, no reminders) or
 * "Scheduled shifts" (assign shifts → reminders). Members left off the rota in a
 * scheduled space simply work open hours. Choosing a mode saves immediately
 * (segmented-control style); the Shifts + Schedule sections reveal only when
 * Scheduled is on.
 */
export function AttendanceTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const initialScheduled = (space.workModel as WorkModel | undefined) != null &&
    space.workModel !== WorkModel.NONE
  const [scheduled, setScheduled] = useState(initialScheduled)

  const mutation = useMutation({
    mutationFn: (workModel: WorkModel) => locationsApi.update(space.id, { workModel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("scheduling.workModel.saved"))
    },
    onError: (err: Error) => {
      notify.error(err.message || t("scheduling.workModel.saveFailed"))
      // Revert the optimistic toggle on failure.
      setScheduled((s) => !s)
    },
  })

  const choose = (next: boolean) => {
    if (next === scheduled || mutation.isPending) return
    setScheduled(next)
    mutation.mutate(next ? WorkModel.SHIFT : WorkModel.NONE)
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={CalendarClock}
        accent="indigo"
        title={t("scheduling.attendanceTab.heading")}
        description={t("scheduling.attendanceTab.intro")}
      />

      {/* Time clock — the universal baseline (informational). */}
      <Card className="flex items-start gap-3 border-dashed bg-muted/30 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("scheduling.attendanceTab.clockTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("scheduling.attendanceTab.clockDesc")}</p>
          {/* Geofence status, derived from the space (physical → verified radius). */}
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {space.lat != null && space.lng != null
              ? t("scheduling.attendanceTab.geofenceOn", { radius: space.geofenceRadius })
              : t("scheduling.attendanceTab.geofenceOff")}
          </p>
        </div>
      </Card>

      {/* Mode: Open hours vs Scheduled shifts (saves on click). */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("scheduling.attendanceTab.modeQuestion")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => choose(false)}
            disabled={mutation.isPending}
            className={cn(
              "rounded-xl border p-4 text-left transition-all disabled:opacity-70",
              !scheduled
                ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-blue-600" /> {t("scheduling.attendanceTab.openTitle")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("scheduling.attendanceTab.openDesc")}</p>
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            disabled={mutation.isPending}
            className={cn(
              "rounded-xl border p-4 text-left transition-all disabled:opacity-70",
              scheduled
                ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarRange className="h-4 w-4 text-blue-600" /> {t("scheduling.attendanceTab.scheduledTitle")}
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("scheduling.attendanceTab.scheduledDesc")}</p>
          </button>
        </div>
      </div>

      {/* Scheduling layer — only when Scheduled is on. */}
      {scheduled && (
        <div className="space-y-6">
          <div className="border-t border-border/60 pt-6">
            <ShiftsTab spaceId={space.id} />
          </div>
          <div className="border-t border-border/60 pt-6">
            <RotaTab spaceId={space.id} />
          </div>
        </div>
      )}

      {/* Open-hours reassurance — nothing else to configure. */}
      {!scheduled && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          {t("scheduling.attendanceTab.openHoursNote")}
        </div>
      )}
    </div>
  )
}
