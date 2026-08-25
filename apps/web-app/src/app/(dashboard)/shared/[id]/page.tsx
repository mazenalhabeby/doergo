"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Building2,
  Loader2,
  Share2,
  ClipboardList,
  Plus,
  ListChecks,
  UserPlus,
  ShieldAlert,
  MapPin,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import {
  tasksApi,
  spaceSharingApi,
  locationsApi,
  attendanceApi,
  trackingApi,
  employeesApi,
  type Task,
  type SpaceShareRequestType,
  type SpaceShareRequestStatus,
  type TimeEntry,
  type EmployeeListItem,
} from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const LEVEL_STYLES: Record<string, string> = {
  VIEW: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CONTRIBUTE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CONTROL: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "border-slate-200 text-slate-500 dark:border-slate-700",
  MEDIUM: "border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-300",
  HIGH: "border-orange-200 text-orange-600 dark:border-orange-800 dark:text-orange-300",
  URGENT: "border-red-200 text-red-600 dark:border-red-800 dark:text-red-300",
}

const REQUEST_STATUS_STYLES: Record<SpaceShareRequestStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
}

export default function SharedSpaceViewPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const spaceId = params.id as string
  const { user } = useAuth()

  // The share (and its capabilities / scope) is already in the auth context — no
  // extra fetch. workers/attendance/tracking are gated by show* flags for a later
  // phase; v1 renders the read-only board + (optionally) request-more.
  const share = user?.access?.sharedSpaces?.find((s) => s.spaceId === spaceId)
  // Capabilities for THIS space (from the server-resolved grant): CONTRIBUTE/CONTROL
  // can create; CONTROL can assign. Drives the direct-control UI (backend enforces).
  const perSpace = user?.access?.perSpace?.[spaceId] ?? {}
  const canCreate = !!perSpace.canCreateTasks
  const canAssign = !!perSpace.canAssignTasks
  const canManageMembers = !!perSpace.canManageWorkspaces || !!perSpace.canManageUsers // CONTROL → add own workers to the space

  const [requestOpen, setRequestOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [addWorkerOpen, setAddWorkerOpen] = useState(false)

  const { data: taskData, isLoading } = useQuery({
    queryKey: ["tasks", "shared", spaceId],
    queryFn: () => tasksApi.list({ spaceId, limit: 100 }),
    enabled: !!share,
  })
  const tasks: Task[] = (taskData?.data as Task[]) || []

  const { data: myRequests } = useQuery({
    queryKey: ["shared-space-requests", spaceId],
    queryFn: () => spaceSharingApi.listGuestRequests(spaceId),
    enabled: !!share,
  })

  // Workers on this space — only when the owner enabled "show workers".
  const { data: workers } = useQuery({
    queryKey: ["shared-space-workers", spaceId],
    queryFn: () => locationsApi.getAssignedMembers(spaceId),
    enabled: !!share && !!share.showWorkers,
  })

  // Attendance — only when the owner enabled "show attendance".
  const { data: attendance } = useQuery({
    queryKey: ["shared-space-attendance", spaceId],
    queryFn: () => attendanceApi.getLocationEntries(spaceId, { limit: 50 }),
    enabled: !!share && !!share.showAttendance,
  })
  const attendanceEntries: TimeEntry[] = attendance?.data ?? []

  // Live worker locations — only when the owner enabled "show tracking".
  const { data: tracked } = useQuery({
    queryKey: ["shared-space-tracking", spaceId],
    queryFn: () => trackingApi.getSpaceWorkers(spaceId),
    enabled: !!share && !!share.showTracking,
    refetchInterval: share?.showTracking ? 30_000 : false,
  })

  const queryClient = useQueryClient()
  const assignMutation = useMutation({
    mutationFn: ({ taskId, workerId }: { taskId: string; workerId: string }) => tasksApi.assign(taskId, workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "shared", spaceId] })
      notify.success(t("spaceSharing.guest.assigned", "Task assigned"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // The auth context surfaces the share by spaceId but not its share id, which the
  // "request more" POST targets — resolve it once from /shared-spaces.
  const { data: sharedSpaces } = useQuery({
    queryKey: ["shared-spaces"],
    queryFn: () => spaceSharingApi.listSharedSpaces(),
    enabled: !!share,
  })
  const shareId = sharedSpaces?.find((s) => s.spaceId === spaceId)?.id ?? ""

  // Not an active shared space for this org (e.g. still pending or revoked).
  if (!share) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <button
            type="button"
            onClick={() => router.push("/locations")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("scheduling.backToSpaces")}
          </button>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-2xl bg-muted/50 p-5 mb-5">
              <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t("spaceSharing.guest.notFound.title")}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">{t("spaceSharing.guest.notFound.description")}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/locations")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("scheduling.backToSpaces")}
          </button>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-foreground tracking-tight truncate">{share.spaceName}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="gap-1 text-xs font-medium border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    <Share2 className="h-3 w-3" />
                    {t("spaceSharing.guest.sharedFrom", { org: share.ownerOrgName })}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs font-medium", LEVEL_STYLES[share.level])}>
                    {t(`spaceSharing.levels.${share.level}.label`)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManageMembers && (
                <Button variant="outline" onClick={() => setAddWorkerOpen(true)} className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {t("spaceSharing.guest.addWorker", "Add worker")}
                </Button>
              )}
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("spaceSharing.guest.newTask", "New task")}
                </Button>
              )}
              {share.allowRequests && (
                <Button variant={canCreate ? "outline" : "default"} onClick={() => setRequestOpen(true)} className="gap-1.5">
                  {!canCreate && <Plus className="h-4 w-4" />}
                  {t("spaceSharing.guest.requestMore")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Task board (read-only) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.tasksHeading")}</h2>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ClipboardList className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-semibold text-foreground">{t("spaceSharing.guest.noTasks")}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[11px] font-medium border-border bg-muted text-muted-foreground">
                          {task.status?.replace(/_/g, " ")}
                        </Badge>
                        {task.priority && (
                          <Badge variant="outline" className={cn("text-[11px] font-medium", PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM)}>
                            {t(`tasks.priority.${task.priority}`, task.priority)}
                          </Badge>
                        )}
                        {task.assignedTo && (
                          <span className="text-[11px] text-muted-foreground">
                            {task.assignedTo.firstName} {task.assignedTo.lastName}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.dueDate && (
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                  {/* CONTROL guests can assign the owner's workers directly. */}
                  {canAssign && workers && workers.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-2.5">
                      <span className="text-[11px] text-muted-foreground">{t("spaceSharing.guest.assignTo", "Assign to")}</span>
                      <Select
                        value={task.assignedTo?.id || ""}
                        onValueChange={(v) => assignMutation.mutate({ taskId: task.id, workerId: v })}
                      >
                        <SelectTrigger className="h-7 w-[190px] text-xs">
                          <SelectValue placeholder={t("spaceSharing.guest.unassigned", "Unassigned")} />
                        </SelectTrigger>
                        <SelectContent>
                          {/* An assignment with no user attached cannot be
                              picked — a Select option whose value is undefined
                              renders but silently refuses to select. */}
                          {workers.filter((w) => w.user?.id).map((w) => (
                            <SelectItem key={w.user!.id} value={w.user!.id}>
                              {w.user?.firstName} {w.user?.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workers on this space (owner enabled "show workers") */}
        {share.showWorkers && workers && workers.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.workersHeading", "Workers on this workspace")}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {workers.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <UserAvatar firstName={w.user?.firstName} lastName={w.user?.lastName} seed={w.user?.id} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {w.user?.firstName} {w.user?.lastName}
                    </p>
                    {w.currentTask ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{w.currentTask}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground truncate">{w.user?.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live locations (owner enabled "show tracking") */}
        {share.showTracking && tracked && tracked.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.trackingHeading", "Live locations")}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {tracked.map((w) => {
                // `updatedAt` is optional: new Date(undefined) is an Invalid
                // Date, and the row read "NaN min ago" rather than showing nothing.
                const seenAt = w.updatedAt ? new Date(w.updatedAt).getTime() : null
                const mins = seenAt ? Math.round((Date.now() - seenAt) / 60000) : null
                const ago = mins == null
                  ? ""
                  : mins <= 1
                    ? t("spaceSharing.guest.justNow", "just now")
                    : t("spaceSharing.guest.minsAgo", "{{m}} min ago", { m: mins })
                return (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <UserAvatar firstName={w.firstName} lastName={w.lastName} seed={w.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{w.firstName} {w.lastName}</p>
                      {w.currentTask ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{w.currentTask.title}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">{ago}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <span className="size-1.5 rounded-full bg-emerald-500" /> {ago}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Attendance (owner enabled "show attendance") */}
        {share.showAttendance && attendanceEntries.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.attendanceHeading", "Attendance")}</h2>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {attendanceEntries.slice(0, 25).map((e) => {
                const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/20 last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar firstName={e.user?.firstName} lastName={e.user?.lastName} seed={e.user?.id} size="sm" />
                      <span className="text-sm font-medium text-foreground truncate">{e.user?.firstName} {e.user?.lastName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      <span>{fmt(e.clockInAt)}</span>
                      <span>→</span>
                      <span>{e.clockOutAt ? fmt(e.clockOutAt) : <span className="text-emerald-600 dark:text-emerald-400">{t("attendance.status.active", "Active")}</span>}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Guest's own requests */}
        {share.allowRequests && myRequests && myRequests.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.myRequests")}</h2>
            </div>
            <div className="grid gap-2">
              {myRequests.map((req) => (
                <div key={req.id} className="rounded-xl border bg-card p-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {req.type === "WORKER" ? <UserPlus className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                        {req.note && <p className="text-xs text-muted-foreground truncate">{req.note}</p>}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[11px] font-medium shrink-0", REQUEST_STATUS_STYLES[req.status])}>
                      {t(`spaceSharing.requestStatuses.${req.status}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {share.allowRequests && (
          <RequestMoreDialog spaceId={spaceId} shareId={shareId} open={requestOpen} onOpenChange={setRequestOpen} />
        )}
        {canCreate && (
          <CreateTaskDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
        )}
        {canManageMembers && (
          <AddWorkerDialog spaceId={spaceId} open={addWorkerOpen} onOpenChange={setAddWorkerOpen} />
        )}
      </div>
    </div>
  )
}

function AddWorkerDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: employees } = useQuery({
    queryKey: ["employees", "for-share"],
    queryFn: () => employeesApi.list({ limit: 100 }),
    enabled: open,
  })
  const list: EmployeeListItem[] = employees?.data ?? []

  const mutation = useMutation({
    mutationFn: (userId: string) => locationsApi.assignMember(spaceId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-space-workers", spaceId] })
      notify.success(t("spaceSharing.guest.workerAdded", "Worker added to the workspace"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spaceSharing.guest.addWorker", "Add worker")}</DialogTitle>
          <DialogDescription>{t("spaceSharing.guest.addWorkerDescription", "Add one of your team to this shared workspace.")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto -mx-1 px-1 py-1 space-y-1">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("spaceSharing.guest.noTeam", "No team members found.")}</p>
          ) : list.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar firstName={e.firstName} lastName={e.lastName} seed={e.id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{e.firstName} {e.lastName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{e.email}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={mutation.isPending} onClick={() => mutation.mutate(e.id)}>
                {t("spaceSharing.guest.add", "Add")}
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close", "Close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateTaskDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("MEDIUM")

  const mutation = useMutation({
    mutationFn: () =>
      tasksApi.create({ spaceId, title: title.trim(), description: description.trim() || undefined, priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "shared", spaceId] })
      notify.success(t("spaceSharing.guest.taskCreated", "Task created"))
      setTitle(""); setDescription(""); setPriority("MEDIUM")
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spaceSharing.guest.newTask", "New task")}</DialogTitle>
          <DialogDescription>{t("spaceSharing.guest.newTaskDescription", "Create a task in this shared workspace.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ct-title" className="text-xs">{t("spaceSharing.guest.requestTitle", "Title")}</Label>
            <Input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-desc" className="text-xs">{t("spaceSharing.guest.requestNote", "Details")}</Label>
            <Textarea id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("tasks.priority.label", "Priority")}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                  <SelectItem key={p} value={p}>{t(`tasks.priority.${p}`, p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => title.trim() && mutation.mutate()} disabled={mutation.isPending || !title.trim()}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("spaceSharing.guest.newTask", "New task")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RequestMoreDialog({
  spaceId,
  shareId,
  open,
  onOpenChange,
}: {
  spaceId: string
  shareId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [type, setType] = useState<SpaceShareRequestType>("TASK")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: () =>
      spaceSharingApi.createGuestRequest(shareId, { type, title: title.trim(), note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-space-requests", spaceId] })
      notify.success(t("spaceSharing.toast.requestSent"))
      setType("TASK")
      setTitle("")
      setNote("")
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.requestSendFailed")),
  })

  const handleSubmit = () => {
    if (!shareId) return notify.error(t("spaceSharing.toast.requestSendFailed"))
    if (!title.trim()) return notify.error(t("spaceSharing.guest.titleRequired"))
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spaceSharing.guest.requestDialogTitle")}</DialogTitle>
          <DialogDescription>{t("spaceSharing.guest.requestDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("spaceSharing.guest.requestType")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as SpaceShareRequestType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TASK">{t("spaceSharing.requestTypes.TASK")}</SelectItem>
                <SelectItem value="WORKER">{t("spaceSharing.requestTypes.WORKER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-title" className="text-xs">{t("spaceSharing.guest.requestTitle")}</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("spaceSharing.guest.requestTitlePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-note" className="text-xs">{t("spaceSharing.guest.requestNote")}</Label>
            <Textarea
              id="req-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t("spaceSharing.guest.requestNotePlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("spaceSharing.guest.sendRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
