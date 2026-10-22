"use client"

import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import { personName, type TaskReport } from "@hbcfield/shared/client"
import { stepFieldLabel } from "@/lib/step-forms"
import { answerText, statusLabel, type Translate } from "../_lib/report-model"

/** What each step asked when the job moved into it: the step, who answered and when, each field and its answer. */
export function ReportStepAnswers({
  report: r,
  when,
}: {
  report: TaskReport
  when: (iso: string | null | undefined) => string
}) {
  const { t, i18n } = useTranslation()
  const tt = t as unknown as Translate
  const locale = i18n.language || "en"
  const h = r.header
  const tr = (k: string, fb: string) => t(k, { defaultValue: fb })
  return (
    <div className="space-y-4">
      {(r.stepAnswers ?? []).map((sub) => (
        <div key={sub.id} className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{statusLabel(sub.statusKey, h.statuses)}</h3>
            <span className="text-xs text-slate-500">
              {[personName(sub.submittedBy), when(sub.submittedAt)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,14rem)_1fr]">
            {sub.fields.map((f) => (
              <Fragment key={f.id}>
                <dt className="text-xs font-medium text-slate-500">{stepFieldLabel(f, tr)}</dt>
                <dd className="whitespace-pre-wrap">{answerText(f, tt, locale)}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
