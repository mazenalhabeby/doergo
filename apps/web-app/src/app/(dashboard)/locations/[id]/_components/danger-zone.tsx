"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArchiveRestore, Info, Loader2, Trash2 } from "lucide-react"

import { type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSpaceLifecycle } from "../../_hooks/use-space-lifecycle"
import { SpaceLifecycleDialog, type SpaceLifecycleMode } from "../../_components/space-lifecycle-dialog"

/**
 * Danger zone — space lifecycle. State-aware:
 *   active space   → Archive (type-to-confirm) + Delete permanently
 *   archived space → Restore (instant, it's safe) + Delete permanently
 * Structural spaces (default bucket, Remote bucket) are never archivable or
 * deletable; the backend enforces the same guards. All actions run through the
 * shared useSpaceLifecycle hook + SpaceLifecycleDialog (DRY with the list page).
 */
export function DangerZone({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const router = useRouter()

  const [dialogMode, setDialogMode] = useState<SpaceLifecycleMode>("archive")
  const [dialogOpen, setDialogOpen] = useState(false)

  const locked = !!space.isDefault || !!space.isRemote
  const taskCount = space._count?.tasks ?? 0

  // Restore is non-destructive — no confirm gate needed.
  const lifecycle = useSpaceLifecycle()

  const openDialog = (mode: SpaceLifecycleMode) => {
    setDialogMode(mode)
    setDialogOpen(true)
  }

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
        {space.isActive ? (
          /* Active → offer Archive */
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
            <Button variant="destructive" className="shrink-0" disabled={locked} onClick={() => openDialog("archive")}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("locations.danger.deleteButton")}
            </Button>
          </div>
        ) : (
          /* Archived → offer Restore */
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium text-foreground">{t("locations.danger.restoreTitle", "Restore this workspace")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("locations.danger.restoreHint", "This workspace is archived. Restoring makes it active and visible in pickers again.")}
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-emerald-600/40 text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-600"
              onClick={() => lifecycle.restore.mutate(space.id)}
              disabled={lifecycle.restore.isPending}
            >
              {lifecycle.restore.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              )}
              {t("locations.restoreAction", "Restore")}
            </Button>
          </div>
        )}

        {/* Permanent delete — empty spaces only (server-guarded). */}
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">{t("locations.purgeSpace", "Delete workspace permanently")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("locations.danger.purgeHint", "Removes the workspace forever. Only possible while it has no tasks, attendance or shift history. This cannot be undone.")}
            </p>
          </div>
          <Button variant="destructive" className="shrink-0" disabled={locked} onClick={() => openDialog("purge")}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("locations.purge", "Delete permanently")}
          </Button>
        </div>
      </CardContent>

      <SpaceLifecycleDialog
        space={space}
        mode={dialogMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        taskCount={taskCount}
        onDone={() => router.push("/locations")}
      />
    </Card>
  )
}
