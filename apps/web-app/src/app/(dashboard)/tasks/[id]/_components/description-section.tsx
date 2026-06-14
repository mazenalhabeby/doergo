"use client"

import { FileText } from "lucide-react"
import { InlineEditField } from "./inline-edit-field"

interface DescriptionSectionProps {
  description: string | null
  canEdit: boolean
  onSave: (value: string) => Promise<void> | void
}

export function DescriptionSection({ description, canEdit, onSave }: DescriptionSectionProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Description</span>
      </div>
      <InlineEditField
        value={description}
        onSave={onSave}
        type="textarea"
        disabled={!canEdit}
        placeholder="Add a description..."
      />
    </div>
  )
}
