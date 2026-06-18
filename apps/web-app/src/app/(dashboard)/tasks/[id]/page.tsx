"use client"

import { useState, use, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  RefreshCw,
  AlertCircle,
  ListChecks,
  Paperclip,
  MessageCircle,
  Clock,
  GitBranch,
  Link2,
  FileText,
  MapPin,
  Settings2,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { useWorkflow, getTransitionsForStatus } from "@/hooks/use-org-workflow"
import { tasksApi, trackingApi, sprintsApi, phasesApi, epicsApi, type WorkflowStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { notify } from "@/lib/toast"
import { AssignMemberDialog } from "@/components/assign-member-dialog"

import {
  TaskProgressCard,
  RouteTrackingSection,
  ServiceReportSection,
  AttachmentsSection,
  CommentsSection,
  ActivitySection,
  EditTaskDialog,
  ChecklistSection,
  AssigneesSection,
  SubtasksSection,
  DependenciesSection,
  CustomFieldsSection,
  CollapsibleSection,
  TaskDetailHeader,
  TaskDetailSidebar,
  DescriptionSection,
} from "./_components"

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, hasModule: orgHasModule } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  const isDispatcher = user?.role === "MANAGER"
  const isAdmin = user?.role === "ADMIN"

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // ─── Queries ────────────────────────────────────────────────────────────
  const { data: task, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["task", id],
    queryFn: () => tasksApi.getById(id),
  })

  const { data: routeData, isLoading: loadingRoute } = useQuery({
    queryKey: ["task-route", id],
    queryFn: () => trackingApi.getTaskRoute(id),
    enabled: (isDispatcher || isAdmin) && !!task,
  })

  // Fetch sprints, phases, epics for sidebar selectors
  const { data: sprints } = useQuery({
    queryKey: ["sprints"],
    queryFn: () => sprintsApi.list(),
  })
  const { data: phases } = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.list(),
  })
  const { data: epicsData } = useQuery({
    queryKey: ["epics"],
    queryFn: () => epicsApi.list(),
  })

  // Space-aware module resolution
  const { hasModule: spaceHasModule } = useSpaceModules(task?.spaceId || null)
  const hasModule = task?.spaceId ? spaceHasModule : orgHasModule

  useEffect(() => {
    if (task?.title) setOverride(id, task.title)
    return () => clearOverride(id)
  }, [id, task?.title, setOverride, clearOverride])

  // ─── Derived State ──────────────────────────────────────────────────────
  const canAssign = isAdmin || isDispatcher
  const { statuses: workflowStatuses, hasWorkflow } = useWorkflow(task?.workflowId)

  const isCanceled = hasWorkflow
    ? workflowStatuses.some((s) => s.key === task?.status && s.isCanceled)
    : task?.status === "CANCELED"
  const isCompleted = hasWorkflow
    ? workflowStatuses.some((s) => s.key === task?.status && s.isFinal)
    : task?.status === "COMPLETED" || task?.status === "CLOSED"
  const hasAssignee = !!task?.assignedTo
  const canEdit = (isAdmin || isDispatcher) && !isCompleted && !isCanceled

  const allowedTransitions = task?.status && hasWorkflow
    ? getTransitionsForStatus(task.status, workflowStatuses)
    : []

  // ─── Mutations ──────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: (workerId: string) => tasksApi.assign(id, workerId),
    onSuccess: () => {
      notify.success(t("tasks.detail.technicianAssigned"))
      setShowAssignModal(false)
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.updateStatus(id, "CANCELED"),
    onSuccess: () => {
      notify.success(t("tasks.detail.requestCancelled"))
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["task", id] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const statusChangeMutation = useMutation({
    mutationFn: (newStatus: string) => tasksApi.updateStatus(id, newStatus),
    onSuccess: () => {
      notify.success("Task status updated")
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // Inline field save
  const handleFieldSave = useCallback(async (field: string, value: string) => {
    const parsed = value === "" ? null : (field === "estimatedHours" || field === "storyPoints" ? Number(value) : value)
    await tasksApi.update(id, { [field]: parsed })
    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
  }, [id, queryClient])

  // Comments
  const [newComment, setNewComment] = useState("")
  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.addComment(id, content),
    onSuccess: () => {
      notify.success(t("tasks.detail.commentAdded"))
      setNewComment("")
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", id], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // ─── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-full bg-background p-8 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64 mb-3" />
        <Skeleton className="h-6 w-96 mb-6" />
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <div className="w-[35%] shrink-0">
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (isError || !task) {
    return (
      <div className="min-h-full bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-card rounded-2xl shadow-sm p-12 text-center">
            <AlertCircle className="mx-auto size-12 text-red-400 mb-4" />
            <p className="font-semibold text-lg mb-2">{t("tasks.detail.failedToLoad")}</p>
            <p className="text-muted-foreground mb-4">{(error as Error)?.message || t("tasks.detail.notFound")}</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-4" /> {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const comments = task.comments || []
  const checklistDone = task.checklistItems?.filter((i: any) => i.isCompleted).length ?? 0
  const checklistTotal = task.checklistItems?.length ?? 0
  const depCount = (task.predecessors?.length || 0) + (task.successors?.length || 0)

  return (
    <div className="min-h-full bg-background">
      {/* Dialogs */}
      <AssignMemberDialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        taskId={id}
        spaceId={task?.spaceId}
        currentAssigneeId={task?.assignedToId}
        currentAssigneeIds={task?.assignees?.map((a: any) => a.userId) || []}
        isAssigning={assignMutation.isPending}
        onAssign={(memberId) => assignMutation.mutate(memberId)}
        onSave={async (added, removed) => {
          const ops: Promise<any>[] = [
            ...removed.map(uid => tasksApi.removeAssignee(id, uid)),
            ...added.map(uid => tasksApi.addAssignee(id, uid)),
          ]
          await Promise.allSettled(ops)
          notify.success("Assignees updated")
          queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
        }}
      />
      <EditTaskDialog task={task} open={showEditDialog} onOpenChange={setShowEditDialog} />

      <div className="p-8 max-w-7xl mx-auto">
        {/* ─── Header ────────────────────────────────────────────────── */}
        <TaskDetailHeader
          task={task}
          user={user}
          canEdit={canEdit}
          canAssign={canAssign}
          isCompleted={isCompleted}
          isCanceled={isCanceled}
          hasAssignee={hasAssignee}
          hasModule={hasModule}
          hasWorkflow={hasWorkflow}
          allowedTransitions={allowedTransitions}
          onTitleSave={(v) => handleFieldSave("title", v)}
          onStatusChange={(s) => statusChangeMutation.mutate(s)}
          onAssignClick={() => setShowAssignModal(true)}
          onEditClick={() => setShowEditDialog(true)}
          onCancelTask={() => deleteMutation.mutate()}
          isStatusChanging={statusChangeMutation.isPending}
        />

        {/* ─── Progress Card — always visible ─────────────────────── */}
        <TaskProgressCard
          taskId={id}
          assignees={task.assignees || []}
          assignedTo={task.assignedTo || null}
          isCompleted={isCompleted}
          taskStatus={task.status}
          createdAt={task.createdAt}
          routeStartedAt={task.routeStartedAt}
          routeEndedAt={task.routeEndedAt}
          routeDistance={task.routeDistance}
          workflowStatuses={hasWorkflow ? workflowStatuses : undefined}
        />

        {/* ─── Two-panel layout ──────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left panel — scrollable main content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Description — always visible */}
            <DescriptionSection
              description={task.description}
              canEdit={canEdit}
              onSave={(v) => handleFieldSave("description", v)}
            />

            {/* Subtasks — module: subtasks */}
            {hasModule("subtasks") && (
              <CollapsibleSection id="subtasks" icon={GitBranch} title="Subtasks" count={task.subtasks?.length || task._count?.subtasks || 0}>
                <SubtasksSection taskId={id} subtasks={task.subtasks} subtaskCount={task._count?.subtasks} />
              </CollapsibleSection>
            )}

            {/* Checklist — module: checklists */}
            {hasModule("checklists") && (checklistTotal > 0 || !isCanceled) && (
              <CollapsibleSection id="checklist" icon={ListChecks} title="Checklist" count={checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : 0}>
                <ChecklistSection taskId={id} items={task.checklistItems || []} />
              </CollapsibleSection>
            )}

            {/* Attachments — module: attachments */}
            {hasModule("attachments") && (
              <CollapsibleSection id="attachments" icon={Paperclip} title="Attachments">
                <AttachmentsSection taskId={id} />
              </CollapsibleSection>
            )}

            {/* Dependencies — module: dependencies */}
            {hasModule("dependencies") && (
              <CollapsibleSection id="dependencies" icon={Link2} title="Dependencies" count={depCount || undefined}>
                <DependenciesSection taskId={id} predecessors={task.predecessors || []} successors={task.successors || []} />
              </CollapsibleSection>
            )}

            {/* Custom Fields — type-scoped; self-hides when the task type has none */}
            <CustomFieldsSection taskId={id} />

            {/* Comments — always visible */}
            <CollapsibleSection id="comments" icon={MessageCircle} title="Comments" count={comments.length || undefined}>
              <CommentsSection
                comments={comments}
                newComment={newComment}
                onCommentChange={setNewComment}
                onSubmit={() => commentMutation.mutate(newComment.trim())}
                isSubmitting={commentMutation.isPending}
              />
            </CollapsibleSection>

            {/* Activity — always visible */}
            <CollapsibleSection id="activity" icon={Clock} title="Activity">
              <ActivitySection taskId={id} />
            </CollapsibleSection>

            {/* Service Report — module: service_reports + must be completed */}
            {hasModule("service_reports") && (isCompleted || task.status === "CLOSED") && (
              <CollapsibleSection id="service-report" icon={FileText} title="Service Report">
                <ServiceReportSection taskId={id} taskStatus={task.status} />
              </CollapsibleSection>
            )}

            {/* Route Tracking — module: tracking + role-gated */}
            {hasModule("tracking") && (isAdmin || isDispatcher) && (
              <CollapsibleSection id="route-tracking" icon={MapPin} title="Route Tracking">
                <RouteTrackingSection routeData={routeData} isLoading={loadingRoute} hasAssignee={hasAssignee} />
              </CollapsibleSection>
            )}
          </div>

          {/* Right sidebar — sticky */}
          <div className="w-full lg:w-[35%] lg:shrink-0 lg:sticky lg:top-6">
            <TaskDetailSidebar
              task={task}
              canEdit={canEdit}
              hasModule={hasModule}
              onFieldSave={handleFieldSave}
              onAssignClick={() => setShowAssignModal(true)}
              onRemoveAssignee={(assigneeId) => {
                const assignee = task.assignees?.find((a: any) => a.id === assigneeId)
                if (assignee) {
                  tasksApi.removeAssignee(id, assignee.userId).then(() => {
                    notify.success("Assignee removed")
                    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
                  }).catch((e: Error) => notify.error(e.message))
                }
              }}
              onSetLead={(assigneeId) => {
                const assignee = task.assignees?.find((a: any) => a.id === assigneeId)
                if (assignee) {
                  tasksApi.removeAssignee(id, assignee.userId).then(() =>
                    tasksApi.addAssignee(id, assignee.userId, "LEAD")
                  ).then(() => {
                    notify.success("Lead updated")
                    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
                  }).catch((e: Error) => notify.error(e.message))
                }
              }}
              sprints={sprints || []}
              phases={phases || []}
              epics={epicsData || []}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
