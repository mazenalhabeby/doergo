"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Loader2, Workflow } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { locationsApi, workflowsApi, type CompanyLocation } from "@/lib/api"
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
import { WorkflowSelector } from "../../_components/workflow-selector"
import { SpaceWorkflowsSection } from "./space-workflows-section"
import { WorkflowBuilder } from "../../_components/workflow-builder"
import { SectionHeader } from "./section-header"

export function WorkflowTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const queryClient = useQueryClient()

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })

  const currentWorkflow = workflows.find((w) => w.id === space.workflowId) || workflows.find((w) => w.isDefault)
  const [selectedId, setSelectedId] = useState(currentWorkflow?.id || "")
  const [editMode, setEditMode] = useState(false)
  const [showCreateBuilder, setShowCreateBuilder] = useState(false)
  const [confirmResync, setConfirmResync] = useState(false)
  const hasChanges = selectedId !== (currentWorkflow?.id || "")

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["location", space.id] })
    queryClient.invalidateQueries({ queryKey: ["locations"] })
  }

  const mutation = useMutation({
    mutationFn: (wfId: string) => locationsApi.update(space.id, { workflowId: wfId }),
    onSuccess: () => {
      notify.success(t("locations.toast.workflowUpdated"))
      onSuccess()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.workflowUpdateFailed")),
  })

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

  const previewWorkflow = workflows.find((w) => w.id === selectedId)

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Workflow}
        accent="primary"
        title={t("locations.tabs.workflow")}
        description={t("locations.workflowHint")}
      />

      {/*
        Which task types this space offers, and which one new tasks inherit.

        This replaced a single picker: a space pointed at exactly one workflow,
        so every space in an organization ran the same flow or someone kept
        near-duplicates at org level. The workflows themselves are still owned
        by the organization — this decides what is OFFERED here, not what it
        contains, so editing one still fixes it everywhere.
      */}
      <SpaceWorkflowsSection spaceId={space.id} />

      {/* Preview / edit still works against whichever type is selected below. */}
      <WorkflowSelector
        value={selectedId}
        onChange={(id) => {
          setSelectedId(id)
          setEditMode(false)
          setShowCreateBuilder(false)
        }}
        workflows={workflows}
        allowCreate={false}
        label={t("locations.previewWorkflow", "Preview or edit a task type")}
      />

      {/* Status preview */}
      {previewWorkflow?.statuses && previewWorkflow.statuses.length > 0 && !editMode && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("locations.statusesWithCount", { count: previewWorkflow.statuses.length })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {previewWorkflow.statuses
              .sort((a, b) => a.position - b.position)
              .map((status) => (
                <span
                  key={status.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-muted text-foreground"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                  {status.name}
                  {status.isFinal && !status.isCanceled && (
                    <span className="text-[10px] text-emerald-600 ml-0.5">{t("workflows.final")}</span>
                  )}
                  {status.isCanceled && (
                    <span className="text-[10px] text-red-500 ml-0.5">{t("workflows.canceled")}</span>
                  )}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Edit / Create buttons */}
      {!editMode && !showCreateBuilder && (
        <div className="flex items-center gap-2">
          {previewWorkflow && (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setEditMode(true)}>
              {t("locations.editWorkflow")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowCreateBuilder(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t("locations.createNew")}
          </Button>
          {hasChanges && (
            <Button onClick={() => mutation.mutate(selectedId)} disabled={mutation.isPending} size="sm" className="ml-auto">
              {mutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          )}
        </div>
      )}

      {/* Inline edit builder */}
      {editMode && previewWorkflow && (
        <WorkflowBuilder
          mode="edit"
          spaceId={space.id}
          workflowId={previewWorkflow.id}
          workflowName={previewWorkflow.name}
          initialTypeCapabilities={previewWorkflow.capabilities ?? []}
          initialStatuses={previewWorkflow.statuses}
          onSaved={() => {
            setEditMode(false)
            queryClient.invalidateQueries({ queryKey: ["workflows"] })
            onSuccess()
          }}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* Inline create builder */}
      {showCreateBuilder && (
        <WorkflowBuilder
          mode="create"
          spaceId={space.id}
          onCreated={(newId) => {
            setSelectedId(newId)
            setShowCreateBuilder(false)
          }}
          onCancel={() => setShowCreateBuilder(false)}
        />
      )}

      {/* Re-sync existing tasks — admin only. Fixes legacy tasks whose status
          no longer matches this space's workflow columns. */}
      {isAdmin && !editMode && !showCreateBuilder && (
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
