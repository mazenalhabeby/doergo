"use client"

import { useTranslation } from "react-i18next"
import type { TaskReport } from "@hbcfield/shared/client"
import { safeImageUrl, signatureName, signatureRole, type Translate } from "../_lib/report-model"

/** The signatures on the job: each image (or "unavailable"), who signed, in which role, when. */
export function ReportSignatures({
  report: r,
  when,
}: {
  report: TaskReport
  when: (iso: string | null | undefined) => string
}) {
  const { t } = useTranslation()
  const tt = t as unknown as Translate
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {(r.signatures ?? []).map((g, i) => {
        const src = safeImageUrl(g.dataUrl) ?? safeImageUrl(g.url)
        return (
          <figure key={i} className="break-inside-avoid">
            <div className="flex h-24 items-center justify-center rounded-md border border-slate-200 bg-white p-1">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={signatureName(g)} loading="lazy" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">{t("tasks.report.photos.unavailable")}</span>
              )}
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
  )
}
