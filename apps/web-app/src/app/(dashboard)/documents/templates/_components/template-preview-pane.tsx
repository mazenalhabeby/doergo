"use client"

import { useTranslation } from "react-i18next"
import { Eye } from "lucide-react"
import { type DocumentTypeRow, type MatchCandidateRow } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { PdfPreview } from "./pdf-preview"

/** The right-hand pane: what the member will actually receive, as text or as the real PDF. */
export function TemplatePreviewPane({
  previewMode, setPreviewMode, sample, body, preview, types, typeId, name,
}: {
  previewMode: "text" | "pdf"
  setPreviewMode: (m: "text" | "pdf") => void
  sample: MatchCandidateRow | null
  body: string
  preview: string
  types: DocumentTypeRow[]
  typeId: string
  name: string
}) {
  const { t } = useTranslation()
  return (
    <aside className="lg:sticky lg:top-6 lg:h-fit">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("documents.templates.preview")}
          </h2>
        </div>

        {/*
          Text or PDF, and both are worth having.

          Text is instant and reads while you type. The PDF is the actual
          artefact — the real font, the real margins, the real page breaks —
          rendered by the SAME code that issues contracts, so a clause
          orphaned at the foot of page two is visible here rather than in
          somebody's personnel file.
        */}
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          {(["text", "pdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPreviewMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                previewMode === m
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              {t(`documents.templates.preview_${m}`)}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {sample
          ? t("documents.templates.previewFor", { name: personName(sample) })
          : t("documents.templates.previewNoOne")}
      </p>

      {previewMode === "pdf" ? (
        <PdfPreview
          body={body}
          title={types.find((ty) => ty.id === typeId)?.label || name}
          memberId={sample?.id}
        />
      ) : (
        /* A page, not a code block: the point is that it reads like the
           letter somebody receives, with the tokens already gone. */
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {body.trim() ? (
            <>
              <p className="mb-4 border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                {types.find((ty) => ty.id === typeId)?.label || name || t("documents.templates.untitled")}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                {preview}
              </pre>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
              {t("documents.templates.previewEmpty")}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {t("documents.templates.notAdvice")}
      </p>
    </aside>
  )
}
