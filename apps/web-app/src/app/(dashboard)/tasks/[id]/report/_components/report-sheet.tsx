"use client"

import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { personName, type TaskReport } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { getPriorityConfig } from "@/lib/constants"
import {
  formatReportDateTime,
  formatReportMinutes,
  letterhead,
  reportFacts,
  reportPills,
  sectionNumbers,
  workSteps,
  type HeadToggle,
  type NumberedSection,
  type Translate,
} from "../_lib/report-model"
import { Fact, Note, TimeBlock, PhotosBlock, DocumentCard } from "./report-blocks"
import { ReportChecklist } from "./report-checklist"
import { ReportHistory } from "./report-history"
import { ReportParts } from "./report-parts-table"
import { ReportRoute } from "./report-route"
import { ReportSignatures } from "./report-signatures"
import { ReportStepAnswers } from "./report-step-answers"

/**
 * The job report as a sheet of paper.
 *
 * ⚠️ PAPER IS WHITE IN DARK MODE TOO — the colours inside are explicit slate,
 * not theme tokens, so the page is what the PDF will look like.
 *
 * Everything is text through React; images come only from the response
 * (`safeImageUrl`: a signed http(s) link or a PNG/JPEG data URL).
 */
export function ReportSheet({
  report: r,
  visible,
  showPrices,
  generatedBy,
  headOff,
}: {
  report: TaskReport
  visible: readonly NumberedSection[]
  showPrices: boolean
  generatedBy: string
  /** The top-of-report switches turned off (letterhead lines, labels, detail boxes). */
  headOff: ReadonlySet<HeadToggle>
}) {
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
        className={
          "flex items-baseline gap-2 border-b border-slate-200 pb-2 text-[15px] " + "font-semibold text-slate-900"
        }
      >
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

  return (
    <article
      className={
        "mx-auto w-full rounded-sm bg-white px-6 py-8 text-slate-800 shadow-sm " +
        "ring-1 ring-slate-200 sm:px-10 sm:py-10 [color-scheme:light]"
      }
    >
      {/* Letterhead */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-blue-600 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          {head.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={head.logoUrl} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
          ) : null}
          <div className="min-w-0 text-xs leading-relaxed text-slate-500">
            <p className="text-base font-semibold text-slate-900">{head.name}</p>
            {head.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold uppercase tracking-wide text-blue-600">{t("tasks.report.documentTitle")}</p>
          <p className="text-sm font-medium tabular-nums text-slate-900">{h.reference}</p>
          <p className="text-xs text-slate-500">{t("tasks.report.issued", { date: when(r.meta.generatedAt) })}</p>
          {r.meta.copy === "client" ? <p className="text-xs text-slate-500">{t("tasks.report.copy.client")}</p> : null}
        </div>
      </header>

      {/* Title + labels */}
      <h1 className="mt-6 text-2xl font-semibold leading-tight text-slate-900">{h.title}</h1>
      {pills.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pills.map((p) =>
            p.key === "status" ? (
              <span
                key={p.key}
                className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs " + "font-semibold"}
                style={{ backgroundColor: `${p.hex}1a`, color: p.hex ?? undefined }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: p.hex ?? undefined }} />
                {p.text}
              </span>
            ) : p.key === "priority" ? (
              <span key={p.key} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", priority.className)}>
                {p.text}
              </span>
            ) : (
              <span key={p.key} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {p.text}
              </span>
            ),
          )}
        </div>
      ) : null}

      {/* Detail boxes — an empty one is never printed, so the grid closes up */}
      {facts.length ? (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-slate-50 p-4 md:grid-cols-4">
          {facts.map((f) => (
            <Fact key={f.key} label={f.label} value={f.value} sub={f.sub} />
          ))}
        </dl>
      ) : null}

      {visible.map((key) => {
        switch (key) {
          case "request":
            return section(
              key,
              t("tasks.report.sections.request"),
              r.request.description?.trim() ? (
                <p className="whitespace-pre-wrap">{r.request.description}</p>
              ) : (
                <p className="text-slate-400">{t("tasks.report.request.none")}</p>
              ),
            )
          case "work": {
            const w = r.work!
            const steps = workSteps(w.workPerformed)
            return section(
              key,
              t("tasks.report.sections.work"),
              <div className="space-y-3">
                <p className="font-medium text-slate-900 whitespace-pre-wrap">{w.summary}</p>
                {steps ? (
                  <ol className="list-decimal space-y-1 pl-5">
                    {steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                ) : w.workPerformed ? (
                  <p className="whitespace-pre-wrap">{w.workPerformed}</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  {t("tasks.report.work.completed", {
                    who: personName(w.completedBy) || "—",
                    when: when(w.completedAt),
                  })}
                  {w.customerName ? ` · ${t("tasks.report.work.customer", { name: w.customerName })}` : ""}
                </p>
              </div>,
            )
          }
          case "time":
            return section(key, t("tasks.report.sections.time"), <TimeBlock report={r} t={tt} when={when} />)
          case "photos":
            return section(
              key,
              t("tasks.report.sections.photos"),
              <PhotosBlock photos={r.photos ?? []} t={tt} when={when} />,
            )
          case "checklist":
            return section(key, t("tasks.report.sections.checklist"), <ReportChecklist report={r} when={when} />)
          case "stepAnswers":
            return section(key, t("tasks.report.sections.stepAnswers"), <ReportStepAnswers report={r} when={when} />)
          case "parts":
            return section(
              key,
              t("tasks.report.sections.parts"),
              <ReportParts parts={r.parts ?? []} showPrices={showPrices} currency={h.currency} />,
            )
          case "route":
            return section(key, t("tasks.report.sections.route"), <ReportRoute route={r.route!} when={when} />)
          case "history":
            return section(key, t("tasks.report.sections.history"), <ReportHistory report={r} tz={tz} />)
          case "comments":
            return section(
              key,
              t("tasks.report.sections.comments"),
              <div className="space-y-3">
                {(r.comments ?? []).map((c) => (
                  <Note key={c.id} who={personName(c.author)} meta={when(c.createdAt)} text={c.content} />
                ))}
              </div>,
            )
          case "handovers":
            return section(
              key,
              t("tasks.report.sections.handovers"),
              <div className="space-y-3">
                {(r.handovers ?? []).map((c) => (
                  <Note
                    key={c.id}
                    who={personName(c.author)}
                    meta={[
                      when(c.createdAt),
                      c.workedMinutes != null
                        ? t("tasks.report.handovers.worked", { time: formatReportMinutes(c.workedMinutes, tt) })
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    text={c.note}
                  />
                ))}
              </div>,
            )
          case "documents":
            return section(
              key,
              t("tasks.report.sections.documents"),
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(r.documents ?? []).map((d) => (
                  <DocumentCard key={d.id} file={d} locale={locale} />
                ))}
              </ul>,
            )
          case "details":
            return section(
              key,
              t("tasks.report.sections.details"),
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(r.details ?? []).map((d) => (
                  <div key={d.id} className="border-b border-slate-100 pb-1.5">
                    <dt className="text-xs text-slate-500">{d.name}</dt>
                    <dd className="whitespace-pre-wrap">{d.value || "—"}</dd>
                  </div>
                ))}
              </dl>,
            )
          case "signatures":
            return section(key, t("tasks.report.sections.signatures"), <ReportSignatures report={r} when={when} />)
        }
      })}

      <footer className="mt-10 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        {[h.issuer.name, h.reference, t("tasks.report.footer", { when: when(r.meta.generatedAt), who: generatedBy })]
          .filter(Boolean)
          .join(" · ")}
      </footer>
    </article>
  )
}
