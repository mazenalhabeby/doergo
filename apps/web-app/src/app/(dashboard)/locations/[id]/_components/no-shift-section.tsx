"use client"

import { keys } from "@/lib/query-keys"
import { formatDuration } from "@hbcfield/shared/client"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Timer } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { PolicyOptionContent } from "./policy-option"
import {
  DEFAULT_NO_SHIFT_POLICY,
  NO_SHIFT_LIMIT,
  clampDailyMinutes,
  isNoShiftPolicy,
  type NoShiftPolicy,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "../../../../../components/common/section-header"
import { OptionFrame } from "@/components/ui/option-card"
import { ChoiceChip } from "@/components/ui/choice-chip"

/**
 * Clocking in here with no shift: allow it, allow up to a number of hours a
 * day, or only with a shift.
 *
 * Members who have a shift are never affected, and the limit counts every hour
 * worked today at ANY workspace — so the note under the choices says both, or
 * the setting reads as "this site's own hours" and is walked around next door.
 */
export function NoShiftSection({
  space,
  schedulesShifts,
}: {
  space: { id: string; noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null }
  /** Does this workspace plan shifts? "Only with a shift" means nothing where none are planned. */
  schedulesShifts: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const savedPolicy: NoShiftPolicy = isNoShiftPolicy(space.noShiftPolicy)
    ? space.noShiftPolicy
    : DEFAULT_NO_SHIFT_POLICY
  const savedMinutes = clampDailyMinutes(space.noShiftDailyMinutes)
  const [policy, setPolicy] = useState<NoShiftPolicy>(savedPolicy)
  const [hours, setHours] = useState(savedMinutes / 60)

  // Follow the server when it changes underneath us (another admin, a refetch).
  useEffect(() => setPolicy(savedPolicy), [savedPolicy])
  useEffect(() => setHours(savedMinutes / 60), [savedMinutes])

  const save = useMutation({
    mutationFn: (next: { noShiftPolicy?: NoShiftPolicy; noShiftDailyMinutes?: number }) =>
      locationsApi.update(space.id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      qc.invalidateQueries({ queryKey: keys.locations.lists() })
      qc.invalidateQueries({ queryKey: keys.attendance.myClockInLocations() })
      notify.success(t("attendance.noShift.saved", "Saved"))
    },
    onError: (e: Error) => {
      notify.error(e.message)
      setPolicy(savedPolicy)
      setHours(savedMinutes / 60)
    },
  })

  const choose = (next: NoShiftPolicy) => {
    if (next === policy || save.isPending) return
    setPolicy(next)
    save.mutate(
      next === "LIMIT"
        ? { noShiftPolicy: next, noShiftDailyMinutes: clampDailyMinutes(hours * 60) }
        : { noShiftPolicy: next },
    )
  }

  const minutes = clampDailyMinutes(Math.round(hours * 60))
  // One number, two meanings: a cap under LIMIT; under ALLOW, when "forgot to clock out?" is asked (and the automatic clock's longest
  // session).
  const hasHours = policy === "LIMIT" || policy === "ALLOW"
  const hoursDirty = hasHours && policy === savedPolicy && minutes !== savedMinutes
  const step = (delta: number) => setHours((h) => clampDailyMinutes(Math.round((h + delta) * 60)) / 60)
  // Hours and minutes ("7h 30m"), never "7.5 h" (clock review C8).
  const formatHours = (m: number) => formatDuration(m)

  const ALL_OPTIONS: { value: NoShiftPolicy; title: string; body: string }[] = [
    {
      value: "ALLOW",
      title: t("attendance.noShift.allow", "Allow"),
      body: t("attendance.noShift.allowHint", "Members clock in and out freely. Every hour counts."),
    },
    {
      value: "LIMIT",
      title: t("attendance.noShift.limit", "Flag days longer than a number of hours"),
      body: t(
        "attendance.noShift.limitHint",
        "Every hour counts. A day longer than this is flagged for the leader to look at.",
      ),
    },
    {
      value: "SHIFT_ONLY",
      title: t("attendance.noShift.shiftOnly", "Only with a shift"),
      body: t("attendance.noShift.shiftOnlyHint", "Members without a shift today cannot clock in here."),
    },
  ]
  // ⚠️ Where no shifts are planned it would refuse everybody, so the server refuses
  // to save it (SHIFT_ONLY_WITHOUT_SHIFTS) — and the choice is not offered.
  const OPTIONS = ALL_OPTIONS.filter((o) => o.value !== "SHIFT_ONLY" || schedulesShifts)

  return (
    <div>
      <SectionHeader
        icon={Timer}
        title={t("attendance.noShift.title", "Clocking in without a shift")}
        description={t(
          "attendance.noShift.subtitle",
          "What happens when a member who has no shift today clocks in here.",
        )}
      />

      <div className="grid gap-2" style={{ maxWidth: 680 }}>
        {OPTIONS.map((o) => {
          const active = policy === o.value
          return (
            <OptionFrame key={o.value} selected={active}>
              <button
                type="button"
                onClick={() => choose(o.value)}
                disabled={save.isPending}
                aria-pressed={active}
                className="flex w-full items-start gap-3 p-4 text-left disabled:opacity-60"
              >
                <PolicyOptionContent active={active} title={o.title} body={o.body} saving={save.isPending} />
              </button>

              {(o.value === "LIMIT" || o.value === "ALLOW") && active && (
                <div className="flex flex-wrap items-center gap-3 px-4 pb-4 pl-11">
                  <div className="inline-flex items-center overflow-hidden rounded-lg border bg-background">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
                      onClick={() => step(-0.5)}
                      disabled={minutes <= NO_SHIFT_LIMIT.MIN_MINUTES}
                      aria-label={t("attendance.noShift.less", "Less")}
                    >
                      −
                    </button>
                    <span
                      className={"min-w-16 border-x px-3 py-1.5 text-center text-sm font-semibold " + "tabular-nums"}
                    >
                      {formatHours(minutes)}
                    </span>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
                      onClick={() => step(0.5)}
                      disabled={minutes >= NO_SHIFT_LIMIT.MAX_MINUTES}
                      aria-label={t("attendance.noShift.more", "More")}
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NO_SHIFT_LIMIT.PRESETS_MINUTES.map((m) => (
                      <ChoiceChip key={m} type="button" on={m === minutes} onClick={() => setHours(m / 60)}>
                        {formatHours(m)}
                      </ChoiceChip>
                    ))}
                  </div>
                  {hoursDirty && (
                    <Button
                      size="sm"
                      onClick={() => save.mutate({ noShiftDailyMinutes: minutes })}
                      disabled={save.isPending}
                    >
                      {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("common.save")}
                    </Button>
                  )}
                  {o.value === "ALLOW" && (
                    <p className="basis-full text-xs leading-snug text-muted-foreground">
                      {t("attendance.noShift.allowHours")}
                    </p>
                  )}
                </div>
              )}
            </OptionFrame>
          )
        })}

        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {t(
            "attendance.noShift.note",
            "Members with a shift are not affected. The limit counts every hour the " +
              "member worked today, at any workspace, in this workspace's time zone.",
          )}
        </p>
      </div>
    </div>
  )
}
