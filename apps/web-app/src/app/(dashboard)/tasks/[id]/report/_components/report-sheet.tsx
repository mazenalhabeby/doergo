"use client"

import dynamic from "next/dynamic"
import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { TaskReport, TaskReportFile, TaskReportPhoto } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { formatMoneyIn } from "@/lib/money"
import { getPriorityConfig } from "@/lib/constants"
import { stepFieldLabel } from "@/lib/step-forms"
import {
  answerText, eventDotHex, eventSentence, fileTypeBadge, formatDayHeading, formatFileSize, formatReportDateTime,
  formatReportDistance, formatReportMinutes, groupEventsByDay, isImageFile, originLabel, pairPhotos, partsTotal,
  personName, routePath, safeImageUrl, sectionNumbers, signatureName, signatureRole, statusHex, statusLabel,
  workSteps, type NumberedSection, type Translate,
} from "../_lib/report-model"

// The task page's own map, loaded only when a route is shown (Leaflet is not small).
const RouteMapView = dynamic(() => import("../../_components/route-map-view"), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-slate-100" />,
})

/**
 * The job report as a sheet of paper.
 *
 * ⚠️ PAPER IS WHITE IN DARK MODE TOO — the colours inside are explicit slate,
 * not theme tokens, so the page is what the PDF will look like.
 *
 * Everything is text through React; images come only from the response
 * (`safeImageUrl`: a signed http(s) link or a PNG/JPEG data URL).
 */
export function ReportSheet({ report: r, visible, showPrices, generatedBy }: {
  report: TaskReport
  visible: readonly NumberedSection[]
  showPrices: boolean
  generatedBy: string
}) {
  const { t, i18n } = useTranslation()
  const tt = t as unknown as Translate
  const locale = i18n.language || "en"
  const tz = r.header.workspace?.timezone ?? null
  const when = (iso: string | null | undefined) => formatReportDateTime(iso, tz, locale)
  const numbers = sectionNumbers(visible)
  const h = r.header
  const issuer = h.issuer

  const section = (key: NumberedSection, title: string, body: ReactNode) => (
    <section key={key} className="break-inside-avoid-page pt-7" aria-labelledby={`report-${key}`}>
      <h2 id={`report-${key}`} className="flex items-baseline gap-2 border-b border-slate-200 pb-2 text-[15px] font-semibold text-slate-900">
        <span className="tabular-nums text-blue-600">{numbers[key]}.</span>
        {title}
      </h2>
      <div className="pt-3 text-sm text-slate-700">{body}</div>
    </section>
  )

  const statusColor = statusHex(h.status, h.statuses)
  const priority = getPriorityConfig(h.priority)
  const origin = originLabel(r, tt)
  const logo = safeImageUrl(issuer.logoUrl)

  return (
    <article className="mx-auto w-full rounded-sm bg-white px-6 py-8 text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-10 sm:py-10 [color-scheme:light]">
      {/* Letterhead */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-blue-600 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
          ) : null}
          <div className="min-w-0 text-xs leading-relaxed text-slate-500">
            <p className="text-base font-semibold text-slate-900">{issuer.name || t("tasks.report.companyFallback")}</p>
            {issuer.addressLines.map((l, i) => <p key={i}>{l}</p>)}
            {[issuer.phone, issuer.email, issuer.website].some(Boolean) ? (
              <p>{[issuer.phone, issuer.email, issuer.website].filter(Boolean).join("  •  ")}</p>
            ) : null}
            {issuer.vatId ? <p>{t("tasks.report.vatId")}: {issuer.vatId}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold uppercase tracking-wide text-blue-600">{t("tasks.report.documentTitle")}</p>
          <p className="text-sm font-medium tabular-nums text-slate-900">{h.reference}</p>
          <p className="text-xs text-slate-500">{t("tasks.report.issued", { date: when(r.meta.generatedAt) })}</p>
          {r.meta.copy === "client" ? <p className="text-xs text-slate-500">{t("tasks.report.copy.client")}</p> : null}
        </div>
      </header>

      {/* Title + pills */}
      <h1 className="mt-6 text-2xl font-semibold leading-tight text-slate-900">{h.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${statusColor}1a`, color: statusColor }}>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          {statusLabel(h.status, h.statuses)}
        </span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", priority.className)}>{t(`tasks.priority.${h.priority}`)}</span>
        {h.taskType ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{h.taskType}</span> : null}
        {origin ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{origin}</span> : null}
      </div>

      {/* Facts */}
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-slate-50 p-4 md:grid-cols-4">
        {h.client ? <Fact label={t("tasks.report.facts.client")} value={h.client.name} sub={h.contact?.name ? [h.contact.name, h.contact.phone].filter(Boolean).join(" · ") : null} /> : null}
        {h.site.address || h.unit ? <Fact label={t("tasks.report.facts.site")} value={h.unit?.name ?? h.site.address ?? ""} sub={h.unit ? (h.unit.address ?? h.site.address) : null} /> : null}
        {h.asset ? <Fact label={t("tasks.report.facts.equipment")} value={h.asset.name} sub={h.asset.serialNumber ? t("tasks.report.facts.serial", { serial: h.asset.serialNumber }) : null} /> : null}
        {h.workspace ? <Fact label={t("tasks.report.facts.workspace")} value={h.workspace.name} /> : null}
        {h.dueDate ? <Fact label={t("tasks.report.facts.due")} value={when(h.dueDate)} /> : null}
        <Fact label={t("tasks.report.facts.started")} value={h.startedAt ? when(h.startedAt) : "—"} sub={h.startedBy ? personName(h.startedBy) : null} />
        <Fact label={t("tasks.report.facts.finished")} value={h.finishedAt ? when(h.finishedAt) : "—"} />
        <Fact label={t("tasks.report.facts.worked")} value={formatReportMinutes(h.totalMinutes, tt)} />
      </dl>

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
                          className={cn("inline-flex size-4 items-center justify-center rounded border text-[10px] font-bold", c.isCompleted ? "border-green-600 bg-green-600 text-white" : "border-slate-300")}
                          aria-label={c.isCompleted ? t("tasks.report.checklist.done") : t("tasks.report.checklist.open")}
                        >
                          {c.isCompleted ? "✓" : ""}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={cn(!c.isCompleted && "text-slate-500")}>{c.text}</span>
                        {c.owner ? <span className="block text-xs text-slate-400">{t("tasks.report.checklist.owner", { name: personName(c.owner) })}</span> : null}
                      </td>
                      <td className="hidden py-2 pr-3 sm:table-cell">{personName(c.completedBy) || "—"}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{c.completedAt ? when(c.completedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            const money = (n: number | null | undefined) => (n == null ? "—" : formatMoneyIn(n, h.currency, locale))
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
              <div className="space-y-4">
                {r.meta.historyTruncated ? <p className="text-xs text-slate-500">{t("tasks.report.history.truncated")}</p> : null}
                {groupEventsByDay(r.history, tz).map((day) => (
                  <div key={day.day}>
                    <h3 className="mb-1.5 text-xs font-semibold text-slate-900">{formatDayHeading(day.day, locale)}</h3>
                    <ol className="space-y-1">
                      {day.items.map(({ event, time }) => (
                        <li key={event.id} className="grid grid-cols-[3rem_0.75rem_1fr] items-start gap-1.5 text-sm">
                          <span className="tabular-nums text-xs leading-5 text-slate-400">{time}</span>
                          <span className="mt-[7px] size-2 rounded-full" style={{ backgroundColor: eventDotHex(event, h.statuses) }} />
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
        {[issuer.name, h.reference, t("tasks.report.footer", { when: when(r.meta.generatedAt), who: generatedBy })].filter(Boolean).join(" · ")}
      </footer>
    </article>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{value || "—"}</dd>
      {sub ? <dd className="break-words text-xs text-slate-500">{sub}</dd> : null}
    </div>
  )
}

function Note({ who, meta, text }: { who: string; meta: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-900">{who || "—"}</span>
        <span className="text-slate-500">{meta}</span>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  )
}

const TIME_KINDS = ["working", "travel", "blocked"] as const
const TIME_BAR = { working: "bg-green-500", travel: "bg-sky-500", blocked: "bg-amber-500" } as const
const TIME_TEXT = { working: "text-green-700", travel: "text-sky-700", blocked: "text-amber-700" } as const

function TimeBlock({ report: r, t, when }: { report: TaskReport; t: Translate; when: (iso: string | null | undefined) => string }) {
  const tm = r.time!
  const people = tm.byPerson ?? []
  const max = Math.max(1, ...people.map((p) => p.travel + p.working + p.blocked))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {TIME_KINDS.map((k) => (
          <div key={k} className="rounded-lg border border-slate-200 p-3">
            <p className={cn("text-xs font-medium", TIME_TEXT[k])}>{t(`tasks.jobTime.${k}`)}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{formatReportMinutes(tm.total[k], t)}</p>
          </div>
        ))}
      </div>
      {people.length ? (
        <div className="space-y-2">
          {people.map((p) => {
            const sum = p.travel + p.working + p.blocked
            return (
              <div key={p.person.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{personName(p.person)}</span>
                <span className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  {TIME_KINDS.map((k) => (p[k] > 0 ? <span key={k} className={TIME_BAR[k]} style={{ width: `${(p[k] / max) * 100}%` }} /> : null))}
                </span>
                <span className="tabular-nums text-xs text-slate-500">{formatReportMinutes(sum, t)}</span>
              </div>
            )
          })}
        </div>
      ) : null}
      {tm.ownStops?.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-900">{t("tasks.report.time.stops")}</p>
          <ul className="space-y-1 text-sm">
            {tm.ownStops.map((o, i) => (
              <li key={i}>
                <span className="font-medium">{personName(o.person) || "—"}</span>
                <span className="text-slate-500"> · {when(o.at)}{o.resumedAt ? ` → ${when(o.resumedAt)}` : ""}</span>
                {o.reason ? <span className="block text-slate-600">“{o.reason}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function Photo({ photo, t, when, tag }: { photo: TaskReportPhoto; t: Translate; when: (iso: string | null | undefined) => string; tag?: "before" | "after" }) {
  const src = safeImageUrl(photo.url)
  const meta = [personName(photo.by), when(photo.createdAt)].filter((x) => x && x !== "—").join(" · ")
  const label = photo.caption ?? (photo.source === "STEP" ? photo.fieldLabel : null)
  return (
    <figure className="min-w-0 break-inside-avoid">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
        {src ? (
          <a href={src} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label ?? photo.fileName} loading="lazy" decoding="async" width={400} height={300} className="size-full object-cover" />
          </a>
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-slate-400">{t("tasks.report.photos.unavailable")}</span>
        )}
        {tag ? (
          <span className={cn("absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", tag === "before" ? "bg-slate-900/75 text-white" : "bg-green-600 text-white")}>
            {t(tag === "before" ? "tasks.report.photos.before" : "tasks.report.photos.after")}
          </span>
        ) : null}
      </div>
      <figcaption className="mt-1 text-xs">
        {label ? <span className="block text-slate-700">{label}</span> : null}
        {meta ? <span className="block text-slate-400">{meta}</span> : null}
      </figcaption>
    </figure>
  )
}

function PhotosBlock({ photos, t, when }: { photos: TaskReportPhoto[]; t: Translate; when: (iso: string | null | undefined) => string }) {
  const { pairs, rest } = pairPhotos(photos)
  return (
    <div className="space-y-5">
      {pairs.map((p) => (
        <div key={`${p.before.id}-${p.after.id}`} className="grid grid-cols-2 gap-3">
          <Photo photo={p.before} t={t} when={when} tag="before" />
          <Photo photo={p.after} t={t} when={when} tag="after" />
        </div>
      ))}
      {rest.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((p) => (
            <Photo key={p.id} photo={p} t={t} when={when} tag={p.source === "BEFORE" ? "before" : p.source === "AFTER" ? "after" : undefined} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DocumentCard({ file, locale }: { file: TaskReportFile; locale: string }) {
  const href = safeImageUrl(file.url)
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", isImageFile(file) ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700")}>
        {fileTypeBadge(file)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{file.fileName}</span>
        <span className="block truncate text-xs text-slate-500">{[formatFileSize(file.fileSize, locale), personName(file.by)].filter(Boolean).join(" · ")}</span>
      </span>
    </>
  )
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">{body}</a>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">{body}</div>
      )}
    </li>
  )
}
