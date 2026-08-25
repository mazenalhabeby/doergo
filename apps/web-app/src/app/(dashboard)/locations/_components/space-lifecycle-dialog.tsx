"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSpaceLifecycle } from "../_hooks/use-space-lifecycle"

export type SpaceLifecycleMode = "archive" | "purge"

/**
 * The one confirm dialog for destructive space lifecycle actions — used by the
 * spaces list AND the settings danger zone so the flow is identical everywhere:
 * type the space name to confirm, then archive or permanently delete (DRY).
 */
export function SpaceLifecycleDialog({
  space,
  mode,
  open,
  onOpenChange,
  taskCount = 0,
  onDone,
}: {
  space: { id: string; name: string } | null
  mode: SpaceLifecycleMode
  open: boolean
  onOpenChange: (open: boolean) => void
  taskCount?: number
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const [confirmText, setConfirmText] = useState("")

  const finish = () => {
    onOpenChange(false)
    onDone?.()
  }
  const lifecycle = useSpaceLifecycle({ onArchived: finish, onPurged: finish })
  const mutation = mode === "purge" ? lifecycle.purge : lifecycle.archive

  // Fresh confirmation every time the dialog opens.
  useEffect(() => {
    if (open) setConfirmText("")
  }, [open])

  if (!space) return null
  const canConfirm = confirmText.trim() === space.name

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "purge"
              ? t("locations.purgeSpace", "Delete workspace permanently")
              : t("locations.danger.dialogTitle", { name: space.name })}
          </DialogTitle>
          <DialogDescription>
            {mode === "purge"
              ? t("locations.danger.purgeDialogDesc", "This permanently removes the workspace. It only succeeds while the workspace has no tasks, attendance or shift history — otherwise archive it instead.")
              : t("locations.danger.dialogDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {mode === "archive" && (
            <p className="text-sm text-muted-foreground">
              {taskCount > 0
                ? t("locations.danger.tasksMoved", { count: taskCount })
                : t("locations.danger.tasksNone")}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="space-lifecycle-confirm">
              {t("locations.danger.confirmLabel", { name: space.name })}
            </Label>
            <Input
              id="space-lifecycle-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={space.name}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate(space.id)}
            disabled={!canConfirm || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("locations.danger.deleting")}
              </>
            ) : mode === "purge" ? (
              t("locations.purge", "Delete permanently")
            ) : (
              t("locations.danger.confirmButton")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
