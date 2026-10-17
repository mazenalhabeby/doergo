"use client"

// Moved here unchanged from shared-with-us-section.tsx — loaded on first open
// (next/dynamic), so the space form and workflow builder stay out of /locations.
import { useTranslation } from "react-i18next"
import { SpaceForm } from "./_components/space-form"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ============================================================================
// CREATE SPACE DIALOG
// ============================================================================

export function CreateSpaceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("locations.createSpace")}</DialogTitle>
          <DialogDescription>{t("locations.createDescription")}</DialogDescription>
        </DialogHeader>
        <SpaceForm
          onCreated={() => {
            onOpenChange(false)
            onSuccess()
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
