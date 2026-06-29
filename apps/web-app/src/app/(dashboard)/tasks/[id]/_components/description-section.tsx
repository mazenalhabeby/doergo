"use client"

import { FileText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { InlineEditField } from "./inline-edit-field"

interface DescriptionSectionProps {
  description: string | null
  canEdit: boolean
  onSave: (value: string) => Promise<void> | void
}

export function DescriptionSection({ description, canEdit, onSave }: DescriptionSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{t("tasks.description.label")}</span>
      </div>
      <InlineEditField
        value={description}
        onSave={onSave}
        type="textarea"
        disabled={!canEdit}
        placeholder={t("tasks.description.addPlaceholder")}
      />
    </div>
  )
}
