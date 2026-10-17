"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { type FloorPerson, type FloorSpace } from "@/lib/api"
import {
  LATE_TEXT,
  byUsefulness,
  isExpected,
  isPresent,
  lateLabel,
  lateness,
  tally,
} from "../_lib/floor-view"

export type Fmt = (d: string | Date, tz?: string | null) => string

/** What this person is doing, in the words the reader would use. */
export function useLine(formatTime: Fmt, tz?: string) {
  const { t } = useTranslation()
  return useCallback(
    (p: FloorPerson): { text: string; tone?: string } => {
      const late = lateness(p)
      switch (p.state) {
        case "busy":
          // The job title is the useful line. "Clocked in" tells a dispatcher
          // nothing; the job name tells them whether it is interruptible.
          return { text: p.task?.title ?? t("cover.chip.free", "Clocked in, free"), tone: "text-blue-600 dark:text-blue-400" }
        case "working":
          return { text: t("cover.chip.freeSince", "Free · in since {{time}}", { time: p.since ? formatTime(p.since, tz) : "—" }) }
        case "break":
          return { text: t("cover.chip.breakSince", "Break · since {{time}}", { time: p.breakSince ? formatTime(p.breakSince, tz) : "—" }) }
        case "expected":
          if (!late) return { text: t("cover.chip.notIn", "Not clocked in") }
          return late.minutes < 0
            ? { text: t("cover.chip.dueIn", "Due {{time}} · in {{ago}}", { time: p.dueAt ? formatTime(p.dueAt, tz) : "—", ago: lateLabel(late.minutes) }), tone: LATE_TEXT[late.tone] }
            : { text: t("cover.chip.lateBy", "Due {{time}} · {{ago}} ago", { time: p.dueAt ? formatTime(p.dueAt, tz) : "—", ago: lateLabel(late.minutes) }), tone: LATE_TEXT[late.tone] }
        case "leave":
          return { text: t("cover.chip.leave", "On leave until {{date}}", { date: p.leaveUntil ?? "—" }) }
        default:
          return { text: t("cover.chip.rest", "Not rostered today") }
      }
    },
    [formatTime, t, tz],
  )
}

/** ExceptionsCard's state and handlers — everything before its markup, moved here unchanged. */
export function useExceptionsCard({ space, formatTime }: Pick<{ space: FloorSpace; formatTime: Fmt }, 'space' | 'formatTime'>) {
  const { t } = useTranslation()
  const c = tally(space)
  const line = useLine(formatTime, space.timezone)

  // Only somebody actually overdue is an exception. Due in ten minutes is not
  // an incident, and treating it as one teaches people to ignore the panel.
  const overdue = space.people
    .filter((p) => {
      const l = lateness(p)
      return l && l.minutes >= 5
    })
    .sort(byUsefulness)

  const here = space.people.filter(isPresent).sort(byUsefulness)
  const soon = space.people.filter((p) => p.state === "expected" && !overdue.includes(p))
  const away = space.people.filter((p) => !isExpected(p))
  const good = overdue.length === 0 && space.status !== "short"

  return {
    t,
    c,
    line,
    overdue,
    here,
    soon,
    away,
    good,
  }
}

/** What ExceptionsCard and its sections read. */
export type ExceptionsCardState = ReturnType<typeof useExceptionsCard>
