"use client"

import { useState, use, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  RefreshCw,
  AlertCircle,
  Calendar,
  Pencil,
  User,
  MoreHorizontal,
  Trash2,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { useTaskEvents } from "@/hooks/use-task-events"
import { tasksApi, trackingApi, type SuggestedTechnician } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getRequestId, formatShortDate } from "@/lib/utils"
import { toast } from "sonner"
import { StatusBadge } from "@/components/tasks/status-badge"
import { TechnicianAssignDialog } from "@/components/technicians/technician-assign-dialog"
import type { TechnicianData } from "@/components/technicians/technician-assign-dialog"

import {
  TaskProgressCard,
  RouteTrackingSection,
  ServiceReportSection,
  AttachmentsSection,
  RequestDetailsSection,
  CommentsSection,
  ActivitySection,
  EditTaskDialog,
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
  const { user } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  const isDispatcher = user?.role === "DISPATCHER"
  const isAdmin = user?.role === "ADMIN"

  const [newComment, setNewComment] = useState("")
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // Real-time updates via Socket.IO
  useTaskEvents(id)

  // Fetch task
  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["task", id],
    queryFn: () => tasksApi.getById(id),
  })

  // Fetch route data for the task (only for dispatchers)
  const { data: routeData, isLoading: loadingRoute } = useQuery({
    queryKey: ["task-route", id],
    queryFn: () => trackingApi.getTaskRoute(id),
    enabled: (isDispatcher || isAdmin) && !!task,
  })

  useEffect(() => {
    if (task?.title) setOverride(id, task.title)
    return () => clearOverride(id)
  }, [id, task?.title, setOverride, clearOverride])

  const canAssign = isAdmin || isDispatcher
  const { data: suggestedData, isLoading: loadingSuggested } = useQuery({
    queryKey: ["suggestedTechnicians", id],
    queryFn: () => tasksApi.getSuggestedTechnicians(id),
    enabled: canAssign && showAssignModal,
    staleTime: 0, // Always refetch when dialog opens
  })

  // Mutations
  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.addComment(id, content),
    onSuccess: () => {
      toast.success(t("tasks.detail.commentAdded"))
      setNewComment("")
      queryClient.invalidateQueries({
        queryKey: ["task", id],
        refetchType: "all",
      })
      queryClient.invalidateQueries({
        queryKey: ["taskTimeline", id],
        refetchType: "all",
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const assignMutation = useMutation({
    mutationFn: (workerId: string) => tasksApi.assign(id, workerId),
    onSuccess: () => {
      toast.success(t("tasks.detail.technicianAssigned"))
      setShowAssignModal(false)
      queryClient.invalidateQueries({
        queryKey: ["task", id],
        refetchType: "all",
      })
      queryClient.invalidateQueries({
        queryKey: ["taskTimeline", id],
        refetchType: "all",
      })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.updateStatus(id, "CANCELED"),
    onSuccess: () => {
      toast.success(t("tasks.detail.requestCancelled"))
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
      queryClient.invalidateQueries({ queryKey: ["task", id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Determine states
  const isCanceled = task?.status === "CANCELED"
  const isCompleted = task?.status === "COMPLETED" || task?.status === "CLOSED"
  const hasAssignee = !!task?.assignedTo

  // Transform suggested technicians to dialog format
  const technicians: TechnicianData[] =
    suggestedData?.technicians
      ?.map((tech: SuggestedTechnician) => ({
        ...tech,
        avatarUrl: undefined,
      })) || []

  // Get suggested technician ID from backend
  const suggestedTechnicianId = suggestedData?.suggestedTechnicianId

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-full bg-muted p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-20 w-full rounded-xl mb-4" />
        <Skeleton className="h-40 w-full rounded-xl mb-4" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  // Error state
  if (isError || !task) {
    return (
      <div className="min-h-full bg-muted p-8">
        <h1 className="text-2xl font-semibold text-foreground mb-6">
          {t("tasks.detail.title")}
        </h1>
        <div className="bg-card rounded-2xl shadow-sm p-12 text-center">
          <AlertCircle className="mx-auto size-12 text-red-400 mb-4" />
          <p className="font-semibold text-lg mb-2">{t("tasks.detail.failedToLoad")}</p>
          <p className="text-muted-foreground mb-4">
            {(error as Error)?.message || t("tasks.detail.notFound")}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 size-4" /> {t("common.retry")}
          </Button>
        </div>
      </div>
    )
  }

  const comments = task.comments || []
  const requestId = getRequestId(task, user?.organizationName)
  const taskDate = formatShortDate(task.createdAt)

  return (
    <div className="min-h-full bg-muted">
      {/* Technician Assignment Dialog */}
      <TechnicianAssignDialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        technicians={technicians}
        isLoading={loadingSuggested}
        isAssigning={assignMutation.isPending}
        onAssign={(techId) => assignMutation.mutate(techId)}
        suggestedTechnicianId={suggestedTechnicianId}
      />

      {/* Edit Task Dialog */}
      <EditTaskDialog
        task={task}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />

      <div className="p-8 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-3">
              {t("tasks.detail.title")}
            </h1>
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={task.status} />
              <span className="text-base font-medium text-foreground">
                {task.title}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{t("tasks.detail.request", { id: requestId })}</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {taskDate}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAssign && !isCompleted && !isCanceled && (
              <Button
                variant="outline"
                className="h-9 px-4 text-sm border-amber-200 bg-amber-500/10 text-amber-700 hover:bg-amber-100 hover:border-amber-300"
                onClick={() => setShowAssignModal(true)}
              >
                <User className="size-4 mr-1.5" />
                {hasAssignee ? t("tasks.detail.reassign") : t("tasks.detail.assign")}
              </Button>
            )}
            {!isCompleted && !isCanceled && (
              <Button
                className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowEditDialog(true)}
              >
                <Pencil className="size-4 mr-2" />
                {t("tasks.detail.editTask")}
              </Button>
            )}

            {/* More Actions Dropdown */}
            {!isCompleted && !isCanceled && (
              <AlertDialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-9 p-0"
                    >
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">{t("common.moreActions")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                        <Trash2 className="size-4 mr-2" />
                        {t("tasks.detail.cancelRequest")}
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("tasks.detail.cancelRequestTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("tasks.detail.cancelRequestDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("tasks.detail.keepRequest")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {t("tasks.detail.cancelRequestConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Progress Card with Technician */}
        {hasAssignee && !isCanceled && (
          <TaskProgressCard
            taskId={id}
            assignedTo={task.assignedTo!}
            isCompleted={isCompleted}
            taskStatus={task.status}
            createdAt={task.createdAt}
            routeStartedAt={task.routeStartedAt}
            routeEndedAt={task.routeEndedAt}
            routeDistance={task.routeDistance}
          />
        )}

        {/* Route Tracking Section */}
        {(isDispatcher || isAdmin) && (
          <RouteTrackingSection
            routeData={routeData}
            isLoading={loadingRoute}
            hasAssignee={hasAssignee}
          />
        )}

        {/* Attachments */}
        <AttachmentsSection taskId={id} />

        {/* Service Report (only when completed) */}
        <ServiceReportSection
          taskId={id}
          taskStatus={task.status}
        />

        {/* Request Details and Activity - 60/40 split */}
        <div className="flex gap-6 mb-6">
          {/* Request Details - 60% */}
          <div className="w-[60%]">
            <RequestDetailsSection task={task} />
          </div>

          {/* Activity - 40% */}
          <div className="w-[40%]">
            <ActivitySection taskId={id} />
          </div>
        </div>

        {/* Comments Section */}
        <CommentsSection
          comments={comments}
          newComment={newComment}
          onCommentChange={setNewComment}
          onSubmit={() => commentMutation.mutate(newComment.trim())}
          isSubmitting={commentMutation.isPending}
        />
      </div>
    </div>
  )
}
