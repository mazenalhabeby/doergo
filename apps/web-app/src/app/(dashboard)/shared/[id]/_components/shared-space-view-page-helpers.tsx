"use client"

import { personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import {
  tasksApi,
  spaceSharingApi,
  locationsApi,
  employeesApi,
  type SpaceShareRequestType,
  type SpaceShareRequestStatus,
  type EmployeeListItem,
} from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** SharedSpaceViewPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const LEVEL_STYLES: Record<string, string> = {
  VIEW: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CONTRIBUTE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CONTROL: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
}

export const REQUEST_STATUS_STYLES: Record<SpaceShareRequestStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
}

export function AddWorkerDialog({
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
    queryKey: keys.employees.shareInvite(),
    queryFn: () => employeesApi.list({ limit: 100 }),
    enabled: open,
  })
  const list: EmployeeListItem[] = employees?.data ?? []

  const mutation = useMutation({
    mutationFn: (userId: string) => locationsApi.assignMember(spaceId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sharedSpaces.workers(spaceId) })
      notify.success(t("spaceSharing.guest.workerAdded", "Worker added to the workspace"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spaceSharing.guest.addWorker", "Add worker")}</DialogTitle>
          <DialogDescription>{t(
            "spaceSharing.guest.addWorkerDescription",
            "Add one of your team to this shared workspace.")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto -mx-1 px-1 py-1 space-y-1">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("spaceSharing.guest.noTeam", "No team members found.")}</p>
          ) : list.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar firstName={e.firstName} lastName={e.lastName} seed={e.id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{personName(e)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{e.email}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(e.id)}>
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

export function CreateTaskDialog({
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
      queryClient.invalidateQueries({ queryKey: keys.tasks.list({ spaceId, limit: 100 }) })
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

export function RequestMoreDialog({
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
      queryClient.invalidateQueries({ queryKey: keys.sharedSpaces.requests(spaceId) })
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
