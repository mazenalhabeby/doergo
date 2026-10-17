"use client"

import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import type { Template } from "./types"

/** The library's starter flows, one button each. */
export function WorkflowTemplates({
  templates,
  onApply,
}: {
  templates: Template[]
  onApply: (template: Template) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("workflows.builder.templates")}</Label>
      <div className="flex flex-wrap gap-1.5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onApply(tpl)}
            title={tpl.statuses.map((st) => st.name).join(" → ")}
            className={"inline-flex items-center rounded-md border border-border px-2.5 py-1 " +
              "text-xs font-medium text-muted-foreground hover:text-foreground " +
              "hover:bg-muted transition-colors"}
          >
            {tpl.name}
          </button>
        ))}
        {templates.length === 0 && (
          <span className="text-xs text-muted-foreground/70">
            {t("workflows.builder.noTemplates", "No starter flows available.")}
          </span>
        )}
      </div>
    </div>
  )
}
