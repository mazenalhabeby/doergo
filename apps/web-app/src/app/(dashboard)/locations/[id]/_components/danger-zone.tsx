"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Info, Loader2, Trash2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Danger zone — deleting (archiving) a space. Structural spaces (the org's
 * default bucket and the Remote clock-in bucket) are never deletable; the
 * backend enforces the same guard. Deleting moves the space's tasks to the
 * default space, so a type-to-confirm gate protects against accidents.
 */
export function DangerZone({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  // 'archive' = deactivate (keeps history); 'purge' = permanent delete (empty spaces only)
  const [mode, setMode] = useState<"archive" | "purge">("archive")

  const locked = !!space.isDefault || !!space.isRemote
  const taskCount = space._count?.tasks ?? 0
  const canDelete = confirmText.trim() === space.name

  const mutation = useMutation({
    mutationFn: () => (mode === "purge" ? locationsApi.purge(space.id) : locationsApi.delete(space.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(mode === "purge" ? t("locations.toast.purged", "Space permanently deleted") : t("locations.danger.deleted"))
      router.push("/locations")
    },
    // For purge the server names exactly what blocks deletion (tasks, attendance, …).
    onError: (err: Error) => notify.error(err.message || t("locations.danger.deleteFailed")),
  })

  return (
    <Card className="max-w-3xl border-destructive/40">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-base text-destructive">{t("locations.danger.title")}</CardTitle>
            <CardDescription>{t("locations.danger.hint")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">{t("locations.danger.deleteTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("locations.danger.deleteHint")}</p>
            {locked && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                {space.isDefault ? t("locations.danger.lockedDefault") : t("locations.danger.lockedRemote")}
              </p>
            )}
          </div>
          <Button
            variant="destructive"
            className="shrink-0"
            disabled={locked}
            onClick={() => {
              setMode("archive")
              setConfirmText("")
              setOpen(true)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("locations.danger.deleteButton")}
          </Button>
        </div>

        {/* Permanent delete — empty spaces only (server-guarded). */}
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">{t("locations.purgeSpace", "Delete space permanently")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("locations.danger.purgeHint", "Removes the space forever. Only possible while it has no tasks, attendance or shift history. This cannot be undone.")}
            </p>
          </div>
          <Button
            variant="destructive"
            className="shrink-0"
            disabled={locked}
            onClick={() => {
              setMode("purge")
              setConfirmText("")
              setOpen(true)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("locations.purge", "Delete permanently")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !mutation.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "purge"
                ? t("locations.purgeSpace", "Delete space permanently")
                : t("locations.danger.dialogTitle", { name: space.name })}
            </DialogTitle>
            <DialogDescription>
              {mode === "purge"
                ? t("locations.danger.purgeDialogDesc", "This permanently removes the space. It only succeeds while the space has no tasks, attendance or shift history — otherwise archive it instead.")
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
              <Label htmlFor="danger-confirm">
                {t("locations.danger.confirmLabel", { name: space.name })}
              </Label>
              <Input
                id="danger-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={space.name}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={!canDelete || mutation.isPending}
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
    </Card>
  )
}
