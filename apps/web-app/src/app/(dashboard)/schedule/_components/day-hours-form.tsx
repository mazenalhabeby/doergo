"use client"

import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { formatDuration } from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { employeesApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import { cn } from "@/lib/utils"
import { checkDayHours, shiftTime, spanMinutes } from "../_lib/day-hours"

/** The person and day the form is about — chosen on the wallchart (or from the drawer). */
export interface PickedDay {
  personId: string
  personName: string
  firstName: string
  dayKey: string
  spaceId: string
  spaceName: string
  self: boolean
}

const QUICK: Array<[key: "startEarlier" | "finishLater" | "finishEarlier", start: number, end: number]> = [
  ["startEarlier", -60, 0],
  ["finishLater", 0, 60],
  ["finishEarlier", 0, -60],
]

/**
 * "Change hours for this day" (docs/plans/time-counting-model.md, phase 2; mockup docs/design/day-hours).
 *
 * It shows the day's plan first, so nobody changes hours without seeing what they replace. Saving
 * writes the member's changed-hours request already approved; the clock counts the new hours with no
 * approval afterwards, and a day already clocked is updated on the server. The times are checked by
 * the shared request parser, so this form refuses exactly what the server would.
 */
export function DayHoursForm({ picked, onClose }: { picked: PickedDay; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const day = parseISO(picked.dayKey)
  const dayLabel = format(day, "EEE d MMM")

  const view = useQuery({
    queryKey: keys.timeOff.dayHours(picked.personId, picked.dayKey, picked.spaceId),
    queryFn: () => employeesApi.getDayHours(picked.personId, picked.dayKey, picked.spaceId),
    enabled: !picked.self,
  })
  const plan = view.data?.plan ?? null
  const changed = view.data?.changed ?? null

  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [reason, setReason] = useState("")
  // Filled once the read answers: the hours already set, else the plan, else an ordinary day.
  useEffect(() => {
    if (!view.data) return
    setStart(changed?.startTime ?? plan?.start ?? "08:00")
    setEnd(changed?.endTime ?? plan?.end ?? "16:00")
    setReason(changed?.reason ?? "")
  }, [view.data, changed, plan])

  const check = useMemo(() => checkDayHours(picked.dayKey, start, end), [picked.dayKey, start, end])

  const save = useMutation({
    mutationFn: () =>
      employeesApi.setDayHours(picked.personId, {
        date: picked.dayKey,
        spaceId: picked.spaceId,
        startTime: start,
        endTime: end,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success(
        t(changed ? "dayHours.toast.changed" : "dayHours.toast.set", { name: picked.firstName, day: dayLabel }),
        { description: t("dayHours.toast.told", { name: picked.firstName }) },
      )
      void queryClient.invalidateQueries({ queryKey: keys.timeOff.org() })
      void queryClient.invalidateQueries({
        queryKey: keys.timeOff.dayHours(picked.personId, picked.dayKey, picked.spaceId),
      })
      onClose()
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const stop = picked.self
    ? t("dayHours.stop.self")
    : view.data?.leave?.status === "APPROVED"
      ? t("dayHours.stop.onLeave", {
          name: picked.firstName,
          from: format(parseISO(view.data.leave.from), "d MMM"),
          to: format(parseISO(view.data.leave.to), "d MMM"),
        })
      : view.data?.leave
        ? t("dayHours.stop.leaveAsked", { name: picked.firstName })
        : null

  const shiftLine = plan ? t("dayHours.plan.shift", { start: plan.start, end: plan.end }) : ""
  const planned = plan ? (plan.name ? `${shiftLine} · ${plan.name}` : shiftLine) : t("dayHours.plan.none")
  const clocked = view.data?.clockedIn

  return (
    <div className="flex flex-col gap-2.5 text-[13.5px]">
      <div className="flex items-baseline gap-2">
        <b className="text-[14.5px] font-semibold">
          {picked.personName} · {dayLabel}
        </b>
        <span className="truncate text-[12px] text-muted-foreground">{picked.spaceName}</span>
      </div>

      {stop ? (
        <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[12.5px] text-foreground">{stop}</p>
      ) : view.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : view.isError ? (
        <p className="text-[12.5px] text-destructive">{serverErrorMessage(view.error, t)}</p>
      ) : (
        <>
          <p className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[12.5px] text-muted-foreground">
            {changed && (
              <span className="block text-foreground">
                {t("dayHours.plan.changed", {
                  start: changed.startTime ?? plan?.start ?? "",
                  end: changed.endTime ?? plan?.end ?? "",
                  by: changed.setBy ?? "",
                })}
              </span>
            )}
            {planned}
            {clocked && (
              <span className="ml-1">
                · <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" />
                {t("dayHours.plan.clockedIn", { time: clocked.at })}
              </span>
            )}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(([key, s, e]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (start) setStart(shiftTime(start, s))
                  if (end) setEnd(shiftTime(end, e))
                }}
                className={
                  "rounded-full border border-border px-2.5 py-0.5 text-[12px] font-medium transition " +
                  "hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                }
              >
                {t(`dayHours.quick.${key}`)}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-medium text-muted-foreground">{t("dayHours.start")}</span>
              <Input id="day-hours-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <span className="pb-2 text-muted-foreground">→</span>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-medium text-muted-foreground">{t("dayHours.end")}</span>
              <Input
                id="day-hours-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={cn(!check.ok && check.why !== "MISSING" && "border-destructive text-destructive")}
              />
            </label>
          </div>

          <p className="text-[13px] tabular-nums">
            {check.ok ? (
              <>
                {start} → {end} {check.night && <b>{t("dayHours.nextMorning")}</b>} ·{" "}
                <b>{formatDuration(check.minutes)}</b>
                {plan && (
                  <span className="ml-1.5 text-[12px] text-muted-foreground">
                    {t("dayHours.was", { duration: formatDuration(spanMinutes(plan.start, plan.end)) })}
                  </span>
                )}
              </>
            ) : (
              <span className="font-medium text-destructive">
                {check.why === "SAME"
                  ? t("dayHours.error.same")
                  : check.why === "TOO_LONG"
                    ? t("dayHours.error.tooLong", { start, end, duration: formatDuration(check.minutes) })
                    : t("dayHours.error.missing")}
              </span>
            )}
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-muted-foreground">{t("dayHours.reason")}</span>
            <Input
              id="day-hours-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("dayHours.reasonPlaceholder")}
            />
          </label>

          <p className="text-[12.5px] text-muted-foreground">
            {clocked?.open
              ? t("dayHours.note.clockedIn", { name: picked.firstName, end })
              : t("dayHours.note.plain", { name: picked.firstName })}
            {check.ok && check.night && <> {t("dayHours.note.night", { day: format(day, "EEEE") })}</>}
          </p>
        </>
      )}

      <div className="flex justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {stop ? t("common.close") : t("common.cancel")}
        </Button>
        {!stop && (
          <Button size="sm" disabled={!check.ok || !view.data || save.isPending} onClick={() => save.mutate()}>
            {changed ? t("dayHours.change") : t("dayHours.set")}
          </Button>
        )}
      </div>
    </div>
  )
}
