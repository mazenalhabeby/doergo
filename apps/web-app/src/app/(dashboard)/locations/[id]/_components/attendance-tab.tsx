"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { CalendarClock, Clock, MapPin, Users } from "lucide-react"

import { type CompanyLocation } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Panel } from "@/components/page/page-kit"
import { SectionHeader } from "../../../../../components/common/section-header"
import { ShiftsTab } from "./shifts-tab"
import { RotaTab } from "./rota-tab"
import { RestsSection } from "./rests-section"
import { AwayPolicySection } from "./away-policy-section"
import { WorkPresetPicker } from "./work-preset-picker"
import { NoShiftSection } from "./no-shift-section"
import { RequestKindsSection } from "./request-kinds-section"
import { AutoClockSection } from "./auto-clock-section"
import { presetOfWorkspace, workspaceSchedulesShifts } from "@hbcfield/shared/client"
import { MinCoverSection } from "./min-cover-section"

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
  const formatDistance = useFormatDistance()

  const isCustom = presetOfWorkspace(space as never) === "CUSTOM"
  const [scheduled, setScheduled] = useState(workspaceSchedulesShifts(space.workModel))

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarClock}
        accent="indigo"
        title={t("scheduling.attendanceTab.heading")}
        description={t("scheduling.attendanceTab.intro")}
      />

      {/* Time clock — the universal baseline (informational). */}
      <Card className="rounded-[22px] shadow-shell flex items-start gap-3 border-dashed bg-muted/30 p-4">
        <span
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 " +
            "dark:text-emerald-300"
          }
        >
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("scheduling.attendanceTab.clockTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("scheduling.attendanceTab.clockDesc")}</p>
          {/* Geofence status, derived from the space (physical → verified radius). */}
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {space.lat != null && space.lng != null
              ? t("scheduling.attendanceTab.geofenceOn", { radius: formatDistance(space.geofenceRadius) })
              : t("scheduling.attendanceTab.geofenceOff")}
          </p>
        </div>
      </Card>

      {/* One question — the way people work here (clock review D1); saves on click. */}
      <WorkPresetPicker space={space} onScheduledChange={setScheduled} />

      {/* Scheduling layer — only when Scheduled is on. */}
      {scheduled && (
        <div className="space-y-4">
          <Panel className="p-5">
            <ShiftsTab spaceId={space.id} />
          </Panel>
          <Panel className="p-5">
            <RotaTab spaceId={space.id} />
          </Panel>
        </div>
      )}

      {/*
        The ceiling on working away from this site.

        Outside the `scheduled` branch and above the rests, because it applies to
        every attendance model: an open-hours workspace has a geofence too.
      */}
      {/* The details the way of working sets — open to change, closed until somebody wants to (D1). */}
      <details className="group rounded-[22px] border border-border bg-card px-5 py-4 shadow-shell" open={isCustom}>
        <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
          {t("workPreset.details", "Change details")}
        </summary>
        <div className="space-y-6 pt-4">
          <div className="border-t border-border pt-5">
            <AwayPolicySection space={space} />
          </div>

          {/* Clocking in with no shift — every attendance model, like the geofence. */}
          <div className="border-t border-border pt-5">
            <NoShiftSection space={space} schedulesShifts={scheduled} />
          </div>
        </div>
      </details>

      {/* What members may ask for here — leave, remote, a changed day, overtime, other. */}
      <Panel className="p-5">
        <RequestKindsSection space={space as CompanyLocation & { requestKinds?: string[] | null }} />
      </Panel>

      {/*
        The automatic clock — entering and leaving the area clocks in and out.
        Renders nothing for the Remote bucket, so it brings its own divider.
      */}
      {!space.isRemote && (
        <Panel className="p-5">
          <AutoClockSection space={space as CompanyLocation & { autoClock?: unknown }} />
        </Panel>
      )}

      {/*
        The staffing floor.

        Here rather than on the leave screen because it is a fact about the
        WORKSPACE, like its geofence and its rests — and because the person who
        knows how many people this site needs is the person configuring the site,
        not whoever happens to be approving a request that afternoon.
      */}
      <Panel className="p-5">
        <MinCoverSection space={space} />
      </Panel>

      {/*
        Rests, under BOTH models.

        Deliberately outside the `scheduled` branch: an open-hours workspace
        still owes its people a lunch, and it is the only thing on this screen
        that is true whether or not the day has a rota. A rest planned "after
        five hours" needs no shift at all — it counts from the clock-in.
      */}
      <Panel className="p-5">
        <RestsSection spaceId={space.id} />
      </Panel>

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
