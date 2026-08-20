"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, Loader2, Workflow } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TaskTypesManager } from "@/components/task-types-manager"
import { SectionHeader } from "./section-header"

export function WorkflowTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const queryClient = useQueryClient()

  const [confirmResync, setConfirmResync] = useState(false)

  // Re-sync legacy tasks onto this space's workflow (admin only).
  const resyncMutation = useMutation({
    mutationFn: () => locationsApi.resyncTasks(space.id),
    onSuccess: (res) => {
      notify.success(t("locations.toast.resyncDone", { count: res?.updated ?? 0 }))
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.resyncFailed")),
  })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Workflow}
        accent="primary"
        title={t("locations.tabs.workflow")}
        description={t("locations.workflowHint")}
      />

      {/*
        One list, one editor.

        There used to be two of each: this tab had a builder that could not set
        transitions or capabilities, and Organization Settings had the capable
        one — the screen furthest from the space that owns the flow. Moving the
        capable one here briefly made it worse, not better: the offerings list
        and the editor showed the SAME task types, one above the other, with two
        separate ways to add from the library. Both lists are now the one below,
        which carries the relationship actions (default here, copy here, share,
        remove) on the same rows that edit the steps.
      */}
      <div className="rounded-xl border border-border bg-card p-4">
        <TaskTypesManager spaceId={space.id} />
      </div>

      {/* Re-sync existing tasks — admin only. Fixes legacy tasks whose status
          no longer matches this space's workflow columns. */}
      {isAdmin && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setConfirmResync(true)}
            disabled={resyncMutation.isPending}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {resyncMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("locations.resyncTasks")}
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground/70">{t("locations.resyncTasksHint")}</p>
        </div>
      )}

      <AlertDialog open={confirmResync} onOpenChange={setConfirmResync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("locations.resyncTasksConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("locations.resyncTasksConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmResync(false)
                resyncMutation.mutate()
              }}
            >
              {t("locations.resyncTasks")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
