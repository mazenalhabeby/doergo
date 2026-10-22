"use client"

import { useTranslation } from "react-i18next"
import { Bell, Briefcase, Palmtree, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { at, type EventDialogProps, type EventForm } from "./use-event-form"

/** Appointment or reminder — and, on a new one, Time off / Job, which open their own forms at this moment. */
export function EventKindTabs({
  editing,
  kind,
  setKind,
  date,
  allDay,
  startAt,
  onOpenChange,
  onTimeOff,
  onNewJob,
}: Pick<EventForm, "editing" | "kind" | "setKind" | "date" | "allDay" | "startAt"> &
  Pick<EventDialogProps, "onOpenChange" | "onTimeOff" | "onNewJob">) {
  const { t } = useTranslation()
  return (
    <div role="tablist" className="inline-flex rounded-xl border bg-muted/40 p-1">
      {(["APPOINTMENT", "REMINDER"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={kind === k}
          onClick={() => setKind(k)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm " +
              "font-medium text-muted-foreground transition",
            kind === k && "bg-background text-foreground shadow-sm ring-1 ring-border",
          )}
        >
          {k === "APPOINTMENT" ? <Users className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {t(k === "APPOINTMENT" ? "calendar.appointment" : "calendar.reminder")}
        </button>
      ))}
      {/* The two that already have their own forms open those, filled with this moment. */}
      {!editing && onTimeOff && (
        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            onTimeOff(date)
          }}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm " +
            "font-medium text-muted-foreground transition hover:text-foreground"
          }
        >
          <Palmtree className="h-4 w-4" />
          {t("calendar.kindTimeOff")}
        </button>
      )}
      {!editing && onNewJob && (
        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            onNewJob(allDay ? at(date, "00:00") : startAt)
          }}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm " +
            "font-medium text-muted-foreground transition hover:text-foreground"
          }
        >
          <Briefcase className="h-4 w-4" />
          {t("calendar.kindJob")}
        </button>
      )}
    </div>
  )
}
