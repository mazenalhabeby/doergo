"use client"

import dynamic from "next/dynamic"
import {
  formatFileSize,
  personName,
  type TaskReport,
  type TaskReportFile,
  type TaskReportPhoto,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import {
  fileTypeBadge,
  formatReportMinutes,
  isImageFile,
  pairPhotos,
  safeImageUrl,
  type Translate,
} from "../_lib/report-model"

/** ReportSheet's module-level helpers, moved here unchanged so its sections can read them too. */
// The task page's own map, loaded only when a route is shown (Leaflet is not small).
export const RouteMapView = dynamic(() => import("../../_components/route-map-view"), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-slate-100" />,
})

export function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{value || "—"}</dd>
      {sub ? <dd className="break-words text-xs text-slate-500">{sub}</dd> : null}
    </div>
  )
}

export function Note({ who, meta, text }: { who: string; meta: string; text: string }) {
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

export const TIME_KINDS = ["working", "travel", "blocked"] as const

export const TIME_BAR = { working: "bg-green-500", travel: "bg-sky-500", blocked: "bg-amber-500" } as const

export const TIME_TEXT = { working: "text-green-700", travel: "text-sky-700", blocked: "text-amber-700" } as const

export function TimeBlock({ report: r, t, when }: { report: TaskReport; t: Translate; when: (iso: string | null | undefined) => string }) {
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
                  {TIME_KINDS.map((k) => (p[k] > 0
                    ? <span key={k} className={TIME_BAR[k]} style={{ width: `${(p[k] / max) * 100}%` }} />
                    : null))}
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

export function Photo(
  {
    photo,
    t,
    when,
    tag
  }: { photo: TaskReportPhoto; t: Translate; when: (iso: string | null | undefined) => string; tag?: "before" | "after" }) {
  const src = safeImageUrl(photo.url)
  const meta = [personName(photo.by), when(photo.createdAt)].filter((x) => x && x !== "—").join(" · ")
  const label = photo.caption ?? (photo.source === "STEP" ? photo.fieldLabel : null)
  return (
    <figure className="min-w-0 break-inside-avoid">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
        {src ? (
          <a href={src} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={label ?? photo.fileName}
              loading="lazy"
              decoding="async"
              width={400}
              height={300}
              className="size-full object-cover"
            />
          </a>
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-slate-400">{t("tasks.report.photos.unavailable")}</span>
        )}
        {tag ? (
          <span
            className={cn(
              ("absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold " + "uppercase tracking-wider"),
              tag === "before" ? "bg-slate-900/75 text-white" : "bg-green-600 text-white")}>
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

export function PhotosBlock(
  { photos, t, when }: { photos: TaskReportPhoto[]; t: Translate; when: (iso: string | null | undefined) => string }) {
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
            <Photo
              key={p.id}
              photo={p}
              t={t}
              when={when}
              tag={p.source === "BEFORE" ? "before" : p.source === "AFTER" ? "after" : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DocumentCard({ file, locale }: { file: TaskReportFile; locale: string }) {
  const href = safeImageUrl(file.url)
  const body = (
    <>
      <span
        className={cn(
          ("flex size-9 shrink-0 items-center justify-center rounded-md text-[10px] " + "font-bold"),
          isImageFile(file) ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700")}>
        {fileTypeBadge(file)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{file.fileName}</span>
        <span
          className="block truncate text-xs text-slate-500">{[formatFileSize(file.fileSize, locale), personName(file.by)].filter(
            Boolean).join(
            " · ")}</span>
      </span>
    </>
  )
  return (
    <li>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={"flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 " + "hover:bg-slate-50"}>{body}</a>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">{body}</div>
      )}
    </li>
  )
}
