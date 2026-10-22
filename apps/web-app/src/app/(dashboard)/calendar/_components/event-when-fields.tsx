"use client"

import { useTranslation } from "react-i18next"
import { durationText } from "@hbcfield/shared/client"
import { CalendarDays } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { EventForm } from "./use-event-form"
import type { EventDialogState } from "./use-event-dialog"

/** All day or not, and when: a day range, or a start and an end with the length (or what is wrong with it). */
export function EventWhenFields({
  allDay,
  setAllDay,
  date,
  setDate,
  endDate,
  setEndDate,
  time,
  endTime,
  setEndTime,
  setStart,
  problem,
  duration,
}: Pick<
  EventForm,
  "allDay" | "setAllDay" | "date" | "setDate" | "endDate" | "setEndDate" | "time" | "endTime" | "setEndTime"
> &
  Pick<EventDialogState, "setStart" | "problem" | "duration">) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center justify-between rounded-xl border px-3 py-2">
        <Label htmlFor="cal-allday" className="flex items-center gap-2 font-normal">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {t("calendar.allDay")}
        </Label>
        <Switch id="cal-allday" checked={allDay} onCheckedChange={setAllDay} />
      </div>

      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cal-date">{t("calendar.from")}</Label>
            <DatePicker
              id="cal-date"
              value={date}
              onChange={(day) => {
                setDate(day)
                if (endDate < day) setEndDate(day)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cal-end">{t("calendar.to")}</Label>
            <DatePicker id="cal-end" value={endDate} min={date} onChange={setEndDate} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-2">
            <Label htmlFor="cal-date">{t("calendar.starts")}</Label>
            <DatePicker id="cal-date" value={date} onChange={(day) => setStart(day, time)} />
            <Input
              id="cal-time"
              aria-label={t("calendar.time")}
              type="time"
              step={300}
              value={time}
              onChange={(e) => setStart(date, e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-2">
            <Label htmlFor="cal-end-date">{t("calendar.ends")}</Label>
            <DatePicker id="cal-end-date" value={endDate} min={date} onChange={setEndDate} />
            <Input
              id="cal-end-time"
              aria-label={t("calendar.time")}
              type="time"
              step={300}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <p
            className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}
            role={problem ? "alert" : undefined}
          >
            {problem === "END_BEFORE_START"
              ? t("calendar.endBeforeStart")
              : problem === "TOO_LONG"
                ? t("calendar.tooLong", { days: 14 })
                : t("calendar.durationAuto", { value: durationText(duration, (k, o) => t(k, o)) })}
          </p>
        </div>
      )}
    </>
  )
}
