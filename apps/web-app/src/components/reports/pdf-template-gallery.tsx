"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { PdfTemplate, PdfTemplateMeta } from "@/lib/report-pdf-options"
import { TemplateThumb } from "./template-thumb"

/** The template gallery of the export studio: a thumbnail per template, and the chosen one's description. */
export function PdfTemplateGallery({
  templates,
  template,
  setTemplate,
  customAccent,
}: {
  templates: PdfTemplateMeta[]
  template: PdfTemplate
  setTemplate: (template: PdfTemplate) => void
  /** The custom template's accent, for its thumbnail. */
  customAccent: string
}) {
  const { t } = useTranslation()
  return (
    <div>
      <p className={"text-[11px] font-semibold uppercase tracking-wide text-muted-foreground " + "mb-2 px-0.5"}>
        {t("reports.templates", "Templates")}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {templates.map((tpl) => {
          const on = template === tpl.key
          return (
            <button
              key={tpl.key}
              onClick={() => setTemplate(tpl.key)}
              className={cn(
                "group text-left rounded-xl border p-2 transition-all",
                on
                  ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]"
                  : "border-border hover:border-primary/40 hover:bg-accent/30",
              )}
            >
              <div className="rounded-lg bg-slate-50 p-2.5 mb-1.5">
                <TemplateThumb template={tpl.key} accent={tpl.key === "custom" ? customAccent : "#2563EB"} />
              </div>
              <div className="flex items-center gap-1 px-0.5">
                <span className="text-xs font-medium text-foreground truncate">
                  {t(`reports.pdfTpl.${tpl.key}.name`, tpl.name)}
                </span>
                {tpl.key === "custom" && (
                  <span
                    className={
                      "rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 " + "font-semibold shrink-0"
                    }
                  >
                    PRO
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 px-0.5 leading-snug">
        {t(`reports.pdfTpl.${template}.desc`, templates.find((x) => x.key === template)?.description || "")}
      </p>
    </div>
  )
}
