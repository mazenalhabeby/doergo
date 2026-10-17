"use client"

import dynamic from "next/dynamic"
import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { formatFileSize, personName, type TaskReport, type TaskReportFile, type TaskReportPhoto } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { formatAmount } from "@/lib/money"
import { getPriorityConfig } from "@/lib/constants"
import { stepFieldLabel } from "@/lib/step-forms"
import {
  answerText, eventDotHex, eventSentence, fileTypeBadge, formatDayHeading, formatReportDateTime,
  formatReportDistance, formatReportMinutes, groupEventsByDay, isImageFile, pairPhotos, partsTotal,
  routePath, safeImageUrl, sectionNumbers, signatureName, signatureRole, statusLabel,
  workSteps, letterhead, reportPills, reportFacts, type HeadToggle, type NumberedSection, type Translate,
} from "../_lib/report-model"
import { useReportSheet } from "./use-report-sheet"
import { RouteMapView, Fact, Note, TimeBlock, PhotosBlock, DocumentCard } from "./report-sheet-helpers"
import { ReportSheetReport } from "./report-sheet-report"
import { ReportSheetReport2 } from "./report-sheet-report2"

/**
 * The job report as a sheet of paper.
 *
 * ⚠️ PAPER IS WHITE IN DARK MODE TOO — the colours inside are explicit slate,
 * not theme tokens, so the page is what the PDF will look like.
 *
 * Everything is text through React; images come only from the response
 * (`safeImageUrl`: a signed http(s) link or a PNG/JPEG data URL).
 */
export function ReportSheet({ report: r, visible, showPrices, generatedBy, headOff }: {
  report: TaskReport
  visible: readonly NumberedSection[]
  showPrices: boolean
  generatedBy: string
  /** The top-of-report switches turned off (letterhead lines, labels, detail boxes). */
  headOff: ReadonlySet<HeadToggle>
}) {
  const vm = useReportSheet({ report: r, visible, showPrices, generatedBy, headOff })
  const {
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
  } = vm

  return (
    <article className="mx-auto w-full rounded-sm bg-white px-6 py-8 text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-10 sm:py-10 [color-scheme:light]">
      {/* Letterhead */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-blue-600 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          {head.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={head.logoUrl} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
          ) : null}
          <div className="min-w-0 text-xs leading-relaxed text-slate-500">
            <p className="text-base font-semibold text-slate-900">{head.name}</p>
            {head.lines.map((l, i) => <p key={i}>{l}</p>)}
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
              <span key={p.key} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${p.hex}1a`, color: p.hex ?? undefined }}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: p.hex ?? undefined }} />
                {p.text}
              </span>
            ) : p.key === "priority" ? (
              <span key={p.key} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", priority.className)}>{p.text}</span>
            ) : (
              <span key={p.key} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{p.text}</span>
            ),
          )}
        </div>
      ) : null}

      {/* Detail boxes — an empty one is never printed, so the grid closes up */}
      {facts.length ? (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-slate-50 p-4 md:grid-cols-4">
          {facts.map((f) => <Fact key={f.key} label={f.label} value={f.value} sub={f.sub} />)}
        </dl>
      ) : null}

      {visible.map((key) => {
        switch (key) {
          case "request":
            return section(key, t("tasks.report.sections.request"),
              r.request.description?.trim()
                ? <p className="whitespace-pre-wrap">{r.request.description}</p>
                : <p className="text-slate-400">{t("tasks.report.request.none")}</p>)
          case "work": {
            const w = r.work!
            const steps = workSteps(w.workPerformed)
            return section(key, t("tasks.report.sections.work"), (
              <div className="space-y-3">
                <p className="font-medium text-slate-900 whitespace-pre-wrap">{w.summary}</p>
                {steps ? (
                  <ol className="list-decimal space-y-1 pl-5">{steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                ) : w.workPerformed ? <p className="whitespace-pre-wrap">{w.workPerformed}</p> : null}
                <p className="text-xs text-slate-500">
                  {t("tasks.report.work.completed", { who: personName(w.completedBy) || "—", when: when(w.completedAt) })}
                  {w.customerName ? ` · ${t("tasks.report.work.customer", { name: w.customerName })}` : ""}
                </p>
              </div>
            ))
          }
          case "time":
            return section(key, t("tasks.report.sections.time"), <TimeBlock report={r} t={tt} when={when} />)
          case "photos":
            return section(key, t("tasks.report.sections.photos"), <PhotosBlock photos={r.photos ?? []} t={tt} when={when} />)
          case "checklist":
            return section(key, t("tasks.report.sections.checklist"), (
              <ReportSheetReport vm={vm} r={r} />
            ))
          case "stepAnswers": {
            const tr = (k: string, fb: string) => t(k, { defaultValue: fb })
            return section(key, t("tasks.report.sections.stepAnswers"), (
              <div className="space-y-4">
                {(r.stepAnswers ?? []).map((sub) => (
                  <div key={sub.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{statusLabel(sub.statusKey, h.statuses)}</h3>
                      <span className="text-xs text-slate-500">{[personName(sub.submittedBy), when(sub.submittedAt)].filter(Boolean).join(" · ")}</span>
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
            ))
          }
          case "parts": {
            const parts = r.parts ?? []
            const money = (n: number | null | undefined) => (n == null ? "—" : formatAmount(n, h.currency, locale))
            const total = partsTotal(parts)
            return section(key, t("tasks.report.sections.parts"), (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 font-medium">{t("tasks.report.parts.part")}</th>
                      <th className="py-2 font-medium">{t("tasks.report.parts.number")}</th>
                      <th className="py-2 text-right font-medium">{t("tasks.report.parts.qty")}</th>
                      {showPrices ? <th className="py-2 text-right font-medium">{t("tasks.report.parts.unit")}</th> : null}
                      {showPrices ? <th className="py-2 text-right font-medium">{t("tasks.report.parts.total")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3">{p.name}{p.notes ? <span className="block text-xs text-slate-400">{p.notes}</span> : null}</td>
                        <td className="py-2 pr-3 text-slate-500">{p.partNumber ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums">{p.quantity.toLocaleString(locale)}</td>
                        {showPrices ? <td className="py-2 text-right tabular-nums">{money(p.unitPrice)}</td> : null}
                        {showPrices ? <td className="py-2 text-right tabular-nums">{money(p.lineTotal)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                  {showPrices && total != null ? (
                    <tfoot>
                      <tr className="font-semibold text-slate-900">
                        <td className="py-2" colSpan={4}>{t("tasks.report.parts.sum")}</td>
                        <td className="py-2 text-right tabular-nums">{money(total)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            ))
          }
          case "route": {
            const rt = r.route!
            return section(key, t("tasks.report.sections.route"), (
              <div className="space-y-3">
                <RouteMapView points={rt.points} matchedPath={routePath(rt)} />
                <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Fact label={t("tasks.report.route.distance")} value={formatReportDistance(rt.distanceMeters, locale)} />
                  <Fact label={t("tasks.report.route.from")} value={`${when(rt.startedAt)} → ${when(rt.endedAt)}`} />
                  <Fact label={t("tasks.report.route.arrival")} value={rt.arrivalDistanceMeters != null ? formatReportDistance(rt.arrivalDistanceMeters, locale) : "—"} />
                  <Fact label={t("tasks.report.route.points")} value={String(rt.pointCount)} />
                </dl>
              </div>
            ))
          }
          case "history":
            return section(key, t("tasks.report.sections.history"), (
              <ReportSheetReport2 vm={vm} r={r} />
            ))
          case "comments":
            return section(key, t("tasks.report.sections.comments"), (
              <div className="space-y-3">
                {(r.comments ?? []).map((c) => (
                  <Note key={c.id} who={personName(c.author)} meta={when(c.createdAt)} text={c.content} />
                ))}
              </div>
            ))
          case "handovers":
            return section(key, t("tasks.report.sections.handovers"), (
              <div className="space-y-3">
                {(r.handovers ?? []).map((c) => (
                  <Note
                    key={c.id}
                    who={personName(c.author)}
                    meta={[when(c.createdAt), c.workedMinutes != null ? t("tasks.report.handovers.worked", { time: formatReportMinutes(c.workedMinutes, tt) }) : ""].filter(Boolean).join(" · ")}
                    text={c.note}
                  />
                ))}
              </div>
            ))
          case "documents":
            return section(key, t("tasks.report.sections.documents"), (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(r.documents ?? []).map((d) => <DocumentCard key={d.id} file={d} locale={locale} />)}
              </ul>
            ))
          case "details":
            return section(key, t("tasks.report.sections.details"), (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(r.details ?? []).map((d) => (
                  <div key={d.id} className="border-b border-slate-100 pb-1.5">
                    <dt className="text-xs text-slate-500">{d.name}</dt>
                    <dd className="whitespace-pre-wrap">{d.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            ))
          case "signatures":
            return section(key, t("tasks.report.sections.signatures"), (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(r.signatures ?? []).map((g, i) => {
                  const src = safeImageUrl(g.dataUrl) ?? safeImageUrl(g.url)
                  return (
                    <figure key={i} className="break-inside-avoid">
                      <div className="flex h-24 items-center justify-center rounded-md border border-slate-200 bg-white p-1">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={signatureName(g)} loading="lazy" className="max-h-full max-w-full object-contain" />
                        ) : <span className="text-xs text-slate-400">{t("tasks.report.photos.unavailable")}</span>}
                      </div>
                      <figcaption className="mt-1.5 text-xs">
                        <span className="block font-medium text-slate-900">{signatureName(g) || "—"}</span>
                        <span className="block text-slate-500">{signatureRole(g, r, tt)}</span>
                        {g.signedAt ? <span className="block text-slate-400">{when(g.signedAt)}</span> : null}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            ))
        }
      })}

      <footer className="mt-10 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        {[h.issuer.name, h.reference, t("tasks.report.footer", { when: when(r.meta.generatedAt), who: generatedBy })].filter(Boolean).join(" · ")}
      </footer>
    </article>
  )
}
