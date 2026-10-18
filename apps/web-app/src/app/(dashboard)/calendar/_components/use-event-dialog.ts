"use client"

import { keys } from "@/lib/query-keys"
import { useMemo } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { spanMinutes, spanProblem, moveEndWithStart, type Repeat } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { calendarApi, type CalendarEventInput } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { dayKey } from "../_lib/layout"
import { useEventDialogData, hm, at, type Props } from "./use-event-dialog-data"
export { hm, at, type Props } from "./use-event-dialog-data"

/** EventDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEventDialog({
  open,
  onOpenChange,
  start,
  event,
  spaceId,
  offices = [],
  crm = false,
  onNewJob,
  onTimeOff,
}: Pick<
  Props,
  "open" | "onOpenChange" | "start" | "event" | "spaceId" | "offices" | "crm" | "onNewJob" | "onTimeOff"
>) {
  const eventDialogData = useEventDialogData({
    open,
    onOpenChange,
    start,
    event,
    spaceId,
    offices,
    crm,
    onNewJob,
    onTimeOff,
  })
  const {
    t,
    qc,
    editing,
    tz,
    kind,
    title,
    allDay,
    date,
    setDate,
    setTime,
    endDate,
    setEndDate,
    setEndTime,
    meetingUrl,
    location,
    description,
    people,
    reminders,
    setReminders,
    freq,
    visibility,
    pickOpen,
    debouncedQ,
    mode,
    place,
    placeSpaceId,
    room,
    phone,
    callDirection,
    customer,
    startAt,
    endAt,
  } = eventDialogData

  const duration = spanMinutes(startAt, endAt)
  // Shared with the server (calendar/span.ts): it ends after it starts, and lasts at most 14 days.
  const problem = allDay ? (endDate < date ? "END_BEFORE_START" : null) : spanProblem(startAt, endAt)
  /** Moving the start carries the end with it, so the duration already set is kept. */
  const setStart = (d: string, tm: string) => {
    const next = at(d, tm)
    if (Number.isNaN(next.getTime())) {
      setDate(d)
      setTime(tm)
      return
    }
    const end = moveEndWithStart(startAt, endAt, next)
    setDate(d)
    setTime(tm)
    setEndDate(dayKey(end))
    setEndTime(hm(end))
  }

  const { data: candidates = [] } = useQuery({
    queryKey: keys.calendar.people(debouncedQ),
    queryFn: () => calendarApi.people(debouncedQ),
    enabled: pickOpen,
    staleTime: 60_000,
  })

  // Free/busy around the chosen time, for everyone invited.
  const windowFrom = useMemo(() => {
    const d = at(date, "07:00")
    return d
  }, [date])
  const windowTo = useMemo(() => at(date, "19:00"), [date])
  const ids = people.map((p) => p.id)
  const { data: avail = [] } = useQuery({
    queryKey: keys.calendar.availability(ids.join(","), windowFrom.toISOString()),
    queryFn: () => calendarApi.availability(ids, windowFrom.toISOString(), windowTo.toISOString()),
    enabled: open && ids.length > 0 && !allDay,
    staleTime: 30_000,
  })
  const clashes = useMemo(() => {
    if (allDay) return []
    return avail
      .filter((a) => {
        const day = a.days.find((d) => d.day === date)
        if (day && (day.leave || day.kind !== "work")) return true
        return a.busy.some((b) => new Date(b.start) < endAt && new Date(b.end) > startAt)
      })
      .filter((a) => ids.includes(a.userId))
  }, [avail, date, startAt, endAt, allDay, ids])

  const findTime = useMutation({
    mutationFn: () =>
      calendarApi.freeSlots({
        userIds: ids,
        durationMin: Math.min(Math.max(duration, 15), 480),
        from: new Date().toISOString(),
        days: 14,
        timezone: tz,
      }),
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const save = useMutation({
    mutationFn: () => {
      const repeat: Repeat | null =
        freq === "NONE" ? null : event?.repeat?.freq === freq ? event.repeat : { freq, interval: 1 }
      const input: CalendarEventInput = {
        // An edit keeps the event's own zone; only a new event takes the browser's.
        kind,
        title: title.trim(),
        allDay,
        ...(editing ? {} : { timezone: tz }),
        ...(allDay
          ? { startDate: date, endDate: endDate < date ? date : endDate }
          : { startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
        meetingUrl: meetingUrl.trim() || null,
        location: location.trim() || null,
        description: description.trim() || null,
        reminders,
        repeat,
        visibility,
        attendeeIds: ids,
        spaceId: event ? undefined : (spaceId ?? null),
        ...(kind === "APPOINTMENT"
          ? {
              meetingMode: mode,
              placeKind: mode === "IN_PERSON" ? place : null,
              placeSpaceId: place === "OFFICE" ? placeSpaceId || null : null,
              room: room.trim() || null,
              phone: phone.trim() || null,
              callDirection,
            }
          : {}),
        ...(crm ? { customerId: customer?.id ?? null } : {}),
      }
      return editing ? calendarApi.update(event!.id, input) : calendarApi.create(input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.calendar.all() })
      qc.invalidateQueries({ queryKey: keys.calendar.event() })
      toast.success(
        editing
          ? t("calendar.savedToast")
          : ids.length
            ? t("calendar.invitedToast", { count: ids.length })
            : t("calendar.createdToast"),
      )
      onOpenChange(false)
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const toggleReminder = (m: number) =>
    setReminders((cur) =>
      cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= 5 ? cur : [...cur, m].sort((a, b) => b - a),
    )

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })

  return {
    ...eventDialogData,
    duration,
    problem,
    setStart,
    candidates,
    windowFrom,
    windowTo,
    ids,
    avail,
    clashes,
    findTime,
    save,
    toggleReminder,
    fmtTime,
  }
}

/** What EventDialog and its sections read. */
export type EventDialogState = ReturnType<typeof useEventDialog>
