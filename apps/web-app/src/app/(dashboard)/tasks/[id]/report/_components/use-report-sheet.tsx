"use client"

import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { type TaskReport } from "@hbcfield/shared/client"
import { getPriorityConfig } from "@/lib/constants"
import {
  formatReportDateTime,
  sectionNumbers,
  letterhead,
  reportPills,
  reportFacts,
  type HeadToggle,
  type NumberedSection,
  type Translate,
} from "../_lib/report-model"

/** ReportSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useReportSheet({ report: r, visible, showPrices, generatedBy, headOff }: Pick<{
  report: TaskReport
  visible: readonly NumberedSection[]
  showPrices: boolean
  generatedBy: string
  /** The top-of-report switches turned off (letterhead lines, labels, detail boxes). */
  headOff: ReadonlySet<HeadToggle>
}, 'report' | 'visible' | 'showPrices' | 'generatedBy' | 'headOff'>) {
  const { t, i18n } = useTranslation()
  const tt = t as unknown as Translate
  const locale = i18n.language || "en"
  const tz = r.header.workspace?.timezone ?? null
  const when = (iso: string | null | undefined) => formatReportDateTime(iso, tz, locale)
  const numbers = sectionNumbers(visible)
  const h = r.header

  const section = (key: NumberedSection, title: string, body: ReactNode) => (
    <section key={key} className="break-inside-avoid-page pt-7" aria-labelledby={`report-${key}`}>
      <h2
        id={`report-${key}`}
        className={"flex items-baseline gap-2 border-b border-slate-200 pb-2 text-[15px] " + "font-semibold text-slate-900"}>
        <span className="tabular-nums text-blue-600">{numbers[key]}.</span>
        {title}
      </h2>
      <div className="pt-3 text-sm text-slate-700">{body}</div>
    </section>
  )

  const priority = getPriorityConfig(h.priority)
  const head = letterhead(h.issuer, headOff, tt)
  const pills = reportPills(r, headOff, tt)
  const facts = reportFacts(r, headOff, tt, when)

  return {
    t,
    tt,
    locale,
    tz,
    when,
    h,
    section,
    priority,
    head,
    pills,
    facts,
  }
}

/** What ReportSheet and its sections read. */
export type ReportSheetState = ReturnType<typeof useReportSheet>
