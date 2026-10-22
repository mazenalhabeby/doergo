"use client"

import { useTranslation } from "react-i18next"
import { personName, type TaskReport } from "@hbcfield/shared/client"
import { eventDotHex, eventSentence, formatDayHeading, groupEventsByDay, type Translate } from "../_lib/report-model"

/** The job's whole history, by day in the workspace's zone, one sentence per event. */
export function ReportHistory({ report: r, tz }: { report: TaskReport; tz: string | null }) {
  const { t, i18n } = useTranslation()
  const tt = t as unknown as Translate
  const locale = i18n.language || "en"
  const h = r.header
  return (
    <div className="space-y-4">
      {r.meta.historyTruncated ? <p className="text-xs text-slate-500">{t("tasks.report.history.truncated")}</p> : null}
      {groupEventsByDay(r.history, tz).map((day) => (
        <div key={day.day}>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-900">{formatDayHeading(day.day, locale)}</h3>
          <ol className="space-y-1">
            {day.items.map(({ event, time }) => (
              <li key={event.id} className="grid grid-cols-[3rem_0.75rem_1fr] items-start gap-1.5 text-sm">
                <span className="tabular-nums text-xs leading-5 text-slate-400">{time}</span>
                <span
                  className="mt-[7px] size-2 rounded-full"
                  style={{ backgroundColor: eventDotHex(event, h.statuses) }}
                />
                <span>
                  {eventSentence(event, h.statuses, tt)}
                  {event.actor ? <span className="text-slate-400"> · {personName(event.actor)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
