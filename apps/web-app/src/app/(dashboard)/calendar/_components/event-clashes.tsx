"use client"

import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"
import { dateLocale } from "@/lib/format-date"
import { dayKey } from "../_lib/layout"
import { hm } from "./use-event-form"
import type { EventDialogState } from "./use-event-dialog"

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

/** Who cannot make it at the chosen time, and the free times "find a time" offers instead. */
export function EventClashes({
  clashes,
  findTime,
  setStart,
}: Pick<EventDialogState, "clashes" | "findTime" | "setStart">) {
  const { t } = useTranslation()
  if (!(clashes.length > 0 || findTime.data)) return null
  return (
    <div
      className={
        "flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 " +
        "text-sm text-amber-800 dark:text-amber-200"
      }
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {clashes.length > 0 && <p>{t("calendar.clash", { names: clashes.map((c) => c.firstName).join(", ") })}</p>}
        {!findTime.data && clashes.length > 0 && (
          <button
            type="button"
            onClick={() => findTime.mutate()}
            className="mt-1 text-xs font-semibold underline-offset-2 hover:underline"
          >
            {t("calendar.findTime")}
          </button>
        )}
        {findTime.data && (
          <div className="mt-2 flex flex-wrap gap-2">
            {findTime.data.length === 0 && <span className="text-xs">{t("calendar.noSlots")}</span>}
            {findTime.data.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => {
                  const d = new Date(s.start)
                  setStart(dayKey(d), hm(d))
                }}
                className={
                  "rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold " +
                  "text-emerald-700 ring-1 ring-emerald-500/30 transition " +
                  "hover:bg-emerald-500/20 dark:text-emerald-300"
                }
              >
                {fmtTime(s.start)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
