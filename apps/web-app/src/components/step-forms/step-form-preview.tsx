"use client"

import { useTranslation } from "react-i18next"
import type { StepFormField } from "@hbcfield/shared/client"
import { stepFieldLabel } from "@/lib/step-forms"

/** What the member sees — a small phone-shaped preview, like the mockup's. */
export function StepFormPreview({ stepName, fields }: { stepName: string; fields: StepFormField[] }) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const required = fields.filter((f) => f.required).length
  const well = "rounded-xl bg-black/40 p-2 space-y-1.5"
  const box = "rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-slate-400"
  return (
    <div className="hidden lg:block" aria-hidden>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("stepForm.preview", "Preview")}
      </p>
      <div className="rounded-[28px] bg-[#111417] p-1.5 shadow-lg">
        <div className="min-h-[280px] space-y-2 rounded-[22px] bg-gradient-to-b from-[#0c1417] to-[#040507] p-3 text-slate-100">
          <div className="mx-auto h-1 w-8 rounded bg-slate-500/40" />
          <p className="text-sm font-light">{stepName || "—"}</p>
          <p className="text-[10px] text-slate-400">
            {fields.length
              ? t("stepForm.dialog.caption", {
                  required,
                  count: fields.length,
                  defaultValue: "{{required}} required · {{count}} fields, from the workflow",
                })
              : t("stepForm.previewNothing", "This step asks nothing — one tap and the job moves.")}
          </p>
          {fields.map((f) => (
            <div key={f.id} className={well}>
              <div className="flex justify-between gap-2 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                <span className="truncate">{stepFieldLabel(f, tr) || "—"}</span>
                <span className={f.required ? "text-emerald-300" : ""}>
                  {f.required ? t("stepForm.required", "Required") : t("stepForm.optional", "Optional")}
                </span>
              </div>
              {f.type === "choice" ? (
                <div className="flex flex-wrap gap-1">
                  {(f.options ?? []).filter(Boolean).map((o, i) => (
                    <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                      {o}
                    </span>
                  ))}
                </div>
              ) : f.type === "photos" ? (
                <div className="grid grid-cols-4 gap-1">
                  <i className="aspect-square rounded-md border border-dashed border-white/15" />
                  <i className="aspect-square rounded-md border border-dashed border-white/15" />
                </div>
              ) : f.type === "signature" ? (
                <div className="h-8 rounded-md border border-dashed border-white/15" />
              ) : f.type === "yesno" ? (
                <div className="flex gap-1">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">
                    {t("stepForm.dialog.yes", "Yes")}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">
                    {t("stepForm.dialog.no", "No")}
                  </span>
                </div>
              ) : (
                <div className={box}>
                  {f.type === "date"
                    ? t("stepForm.dialog.datePlaceholder", "Pick a day")
                    : f.type === "number"
                      ? "0"
                      : t("stepForm.dialog.notePlaceholder", "Type here…")}
                </div>
              )}
            </div>
          ))}
          <div
            className={
              "rounded-full bg-gradient-to-b from-[#7fe6c8] to-[#10b993] py-1.5 " +
              "text-center text-[11px] font-medium text-[#001810]"
            }
          >
            {stepName || "—"}
          </div>
        </div>
      </div>
    </div>
  )
}
