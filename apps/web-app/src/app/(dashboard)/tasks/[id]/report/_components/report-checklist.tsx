"use client"

import { personName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { TaskReport } from "@hbcfield/shared/client"

/** The report's checklist: each item ticked or open, its owner, who did it and when. */
export function ReportChecklist({
  report: r,
  when,
}: {
  report: TaskReport
  when: (iso: string | null | undefined) => string
}) {
  const { t } = useTranslation()
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
          <th className="w-8 py-2" />
          <th className="py-2 font-medium">{t("tasks.report.checklist.item")}</th>
          <th className="hidden py-2 font-medium sm:table-cell">{t("tasks.report.checklist.doneBy")}</th>
          <th className="py-2 text-right font-medium">{t("tasks.report.checklist.when")}</th>
        </tr>
      </thead>
      <tbody>
        {(r.checklist ?? []).map((c) => (
          <tr key={c.id} className="border-b border-slate-100 align-top">
            <td className="py-2">
              <span
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded border " + "text-[10px] font-bold",
                  c.isCompleted ? "border-green-600 bg-green-600 text-white" : "border-slate-300",
                )}
                aria-label={c.isCompleted ? t("tasks.report.checklist.done") : t("tasks.report.checklist.open")}
              >
                {c.isCompleted ? "✓" : ""}
              </span>
            </td>
            <td className="py-2 pr-3">
              <span className={cn(!c.isCompleted && "text-slate-500")}>{c.text}</span>
              {c.owner ? (
                <span className="block text-xs text-slate-400">
                  {t("tasks.report.checklist.owner", { name: personName(c.owner) })}
                </span>
              ) : null}
            </td>
            <td className="hidden py-2 pr-3 sm:table-cell">{personName(c.completedBy) || "—"}</td>
            <td className="py-2 text-right text-xs text-slate-500">{c.completedAt ? when(c.completedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
