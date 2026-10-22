"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { type FloorPerson } from "@/lib/api"
import { LATE_TEXT, lateLabel, lateness } from "../_lib/floor-view"

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
          return {
            text: p.task?.title ?? t("cover.chip.free", "Clocked in, free"),
            tone: "text-blue-600 dark:text-blue-400",
          }
        case "working":
          return {
            text: t("cover.chip.freeSince", "Free · in since {{time}}", {
              time: p.since ? formatTime(p.since, tz) : "—",
            }),
          }
        case "break":
          return {
            text: t("cover.chip.breakSince", "Break · since {{time}}", {
              time: p.breakSince ? formatTime(p.breakSince, tz) : "—",
            }),
          }
        case "expected":
          if (!late) return { text: t("cover.chip.notIn", "Not clocked in") }
          return late.minutes < 0
            ? {
                text: t("cover.chip.dueIn", "Due {{time}} · in {{ago}}", {
                  time: p.dueAt ? formatTime(p.dueAt, tz) : "—",
                  ago: lateLabel(late.minutes),
                }),
                tone: LATE_TEXT[late.tone],
              }
            : {
                text: t("cover.chip.lateBy", "Due {{time}} · {{ago}} ago", {
                  time: p.dueAt ? formatTime(p.dueAt, tz) : "—",
                  ago: lateLabel(late.minutes),
                }),
                tone: LATE_TEXT[late.tone],
              }
        case "leave":
          return { text: t("cover.chip.leave", "On leave until {{date}}", { date: p.leaveUntil ?? "—" }) }
        default:
          return { text: t("cover.chip.rest", "Not rostered today") }
      }
    },
    [formatTime, t, tz],
  )
}
