"use client"

import { type RecurringTaskTemplate } from "@/lib/api"
import { Dialog } from "@/components/ui/dialog"
import { useTemplateDialog } from "../_hooks/use-template-dialog"
import { TemplateDialogRecurring } from "./template-dialog-recurring"

/** The create/edit dialog of a recurring template — moved here unchanged. */
export function TemplateDialog({
  open,
  onOpenChange,
  existingTemplate,
  defaultSpaceId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTemplate: RecurringTaskTemplate | null
  /** Pre-selected space when creating new (e.g. the active space filter). */
  defaultSpaceId?: string | null
}) {
  const vm = useTemplateDialog({ open, onOpenChange, existingTemplate, defaultSpaceId })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TemplateDialogRecurring vm={vm} onOpenChange={onOpenChange} />
    </Dialog>
  )
}
