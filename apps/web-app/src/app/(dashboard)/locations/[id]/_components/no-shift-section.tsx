"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Timer } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  DEFAULT_NO_SHIFT_POLICY,
  NO_SHIFT_LIMIT,
  clampDailyMinutes,
  isNoShiftPolicy,
  type NoShiftPolicy,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "./section-header"

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
}: {
  space: { id: string; noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null }
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const savedPolicy: NoShiftPolicy = isNoShiftPolicy(space.noShiftPolicy) ? space.noShiftPolicy : DEFAULT_NO_SHIFT_POLICY
  const savedMinutes = clampDailyMinutes(space.noShiftDailyMinutes)
  const [policy, setPolicy] = useState<NoShiftPolicy>(savedPolicy)
  const [hours, setHours] = useState(savedMinutes / 60)

  // Follow the server when it changes underneath us (another admin, a refetch).
  useEffect(() => setPolicy(savedPolicy), [savedPolicy])
  useEffect(() => setHours(savedMinutes / 60), [savedMinutes])

  const save = useMutation({
    mutationFn: (next: { noShiftPolicy?: NoShiftPolicy; noShiftDailyMinutes?: number }) => locationsApi.update(space.id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", space.id] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      qc.invalidateQueries({ queryKey: ["my-clock-in-locations"] })
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
    save.mutate(next === "LIMIT" ? { noShiftPolicy: next, noShiftDailyMinutes: clampDailyMinutes(hours * 60) } : { noShiftPolicy: next })
  }

  const minutes = clampDailyMinutes(Math.round(hours * 60))
  const hoursDirty = policy === "LIMIT" && savedPolicy === "LIMIT" && minutes !== savedMinutes
  const step = (delta: number) => setHours((h) => clampDailyMinutes(Math.round((h + delta) * 60)) / 60)
  const formatHours = (m: number) => t("attendance.noShift.hours", { count: m / 60, defaultValue: `${m / 60} h` })

  const OPTIONS: { value: NoShiftPolicy; title: string; body: string }[] = [
    {
      value: "ALLOW",
      title: t("attendance.noShift.allow", "Allow"),
      body: t("attendance.noShift.allowHint", "Members clock in and out freely. Every hour counts."),
    },
    {
      value: "LIMIT",
      title: t("attendance.noShift.limit", "Allow up to a number of hours a day"),
      body: t("attendance.noShift.limitHint", "Time past the limit counts only when a leader approves it as overtime."),
    },
    {
      value: "SHIFT_ONLY",
      title: t("attendance.noShift.shiftOnly", "Only with a shift"),
      body: t("attendance.noShift.shiftOnlyHint", "Members without a shift today cannot clock in here."),
    },
  ]

  return (
    <div>
      <SectionHeader
        icon={Timer}
        title={t("attendance.noShift.title", "Clocking in without a shift")}
        description={t("attendance.noShift.subtitle", "What happens when a member who has no shift today clocks in here.")}
      />

      <div className="grid gap-2" style={{ maxWidth: 680 }}>
        {OPTIONS.map((o) => {
          const active = policy === o.value
          return (
            <div
              key={o.value}
              className={cn(
                "rounded-xl border transition-colors",
                active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <button
                type="button"
                onClick={() => choose(o.value)}
                disabled={save.isPending}
                aria-pressed={active}
                className="flex w-full items-start gap-3 p-4 text-left disabled:opacity-60"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary" : "border-border",
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{o.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.body}</span>
                </span>
                {save.isPending && active && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
              </button>

              {o.value === "LIMIT" && active && (
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
                    <span className="min-w-16 border-x px-3 py-1.5 text-center text-sm font-semibold tabular-nums">{formatHours(minutes)}</span>
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
                      <button
                        key={m}
                        type="button"
                        onClick={() => setHours(m / 60)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          m === minutes ? "border-primary text-primary" : "text-muted-foreground hover:border-muted-foreground/40",
                        )}
                      >
                        {formatHours(m)}
                      </button>
                    ))}
                  </div>
                  {hoursDirty && (
                    <Button size="sm" onClick={() => save.mutate({ noShiftDailyMinutes: minutes })} disabled={save.isPending}>
                      {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("common.save")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {t(
            "attendance.noShift.note",
            "Members with a shift are not affected. The limit counts every hour the member worked today, at any workspace, in this workspace's time zone.",
          )}
        </p>
      </div>
    </div>
  )
}
