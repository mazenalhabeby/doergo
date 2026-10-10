"use client"

import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"

/**
 * Cancel and Create (or Save, when editing) under a create/edit dialog, the
 * primary button spinning while it saves.
 */
export function SaveDialogFooter({
  onCancel,
  onSave,
  disabled,
  pending,
  isEditing,
}: {
  onCancel: () => void
  onSave: () => void
  disabled: boolean
  pending: boolean
  isEditing: boolean
}) {
  const { t } = useTranslation()
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button
        onClick={onSave}
        disabled={disabled}
        className="bg-blue-600 hover:bg-blue-700"
      >
        {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isEditing ? t("common.save") : t("common.create")}
      </Button>
    </DialogFooter>
  )
}
