"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Hand, Loader2, Minus, Plus, Undo2, UsersRound, X } from "lucide-react"
import { ROLE_SPOTS_MAX, isOpenToRole, isWorkOver, spotsTaken } from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type Task } from "@/lib/api"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"

/**
 * A task OPEN TO A WORK ROLE, on its own page (shared tasks/role-pool.ts).
 *
 * Three people read this card, and each gets their own control:
 *  · somebody holding the role, not on it yet → Take it
 *  · somebody who took it, before the work starts → Hand back to the role
 *  · the office (may assign here) → how many it needs, or close it
 *
 * ⚠️ "May I take it" is the SERVER's answer: the task is in the caller's
 * open-for-me list. The card never decides eligibility from roles it holds.
 */
export function OpenRoleCard({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState("")

  const open = isOpenToRole(task)
  const { taken, of } = spotsTaken(task)
  const onIt = !!user && ((task as any).assignees ?? []).some((a: any) => (a.userId ?? a.user?.id) === user.id)
  const mayAssign = user?.role === "ADMIN" || hasPermission("canAssignTasks")

  const { data: openForMe = [] } = useQuery({
    queryKey: keys.taskExtras.openForMe(),
    queryFn: () => tasksApi.openForMe(),
    enabled: open && !onIt,
    staleTime: 15_000,
  })
  const mayTake = open && !onIt && openForMe.some((o) => o.id === task.id)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: keys.tasks.detail(task.id) })
    queryClient.invalidateQueries({ queryKey: keys.taskExtras.openForMe() })
    queryClient.invalidateQueries({ queryKey: keys.tasks.lists() })
    queryClient.invalidateQueries({ queryKey: keys.tasks.time(task.id) })
  }
  const fail = (e: unknown) => {
    const err = e as { code?: string; params?: { takers?: string[] } }
    if (err?.code === "ROLE_TASK_TAKEN") {
      notify.error(t("tasks.role.tookFirst", { names: (err.params?.takers ?? []).join(", ") || t("tasks.role.someoneElse") }))
      refresh()
      return
    }
    notify.error(serverErrorMessage(e, t, i18n.language))
  }

  const take = useMutation({
    mutationFn: () => tasksApi.take(task.id),
    onSuccess: () => { notify.success(t("tasks.role.youTookIt")); refresh() },
    onError: fail,
  })
  const giveBack = useMutation({
    mutationFn: () => tasksApi.returnToRole(task.id, reason.trim() || undefined),
    onSuccess: () => { notify.success(t("tasks.role.returned")); setReturning(false); setReason(""); refresh() },
    onError: fail,
  })
  const setRole = useMutation({
    mutationFn: (body: { roleId: string | null; spots?: number }) => tasksApi.setOpenRole(task.id, body),
    onSuccess: refresh,
    onError: fail,
  })

  if (!task.openRoleId) return null
  const roleName = task.openRole?.name ?? ""
  // "Not started" by facts, as the server asks it — a custom flow's first step counts (the server has the last word).
  const notStarted = !["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "BLOCKED"].includes(task.status) && !isWorkOver(task.status)
  const openMin = task.openedAt ? Math.max(0, Math.round((Date.now() - Date.parse(task.openedAt)) / 60_000)) : null

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
          <UsersRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {open ? t("tasks.role.openTo", { role: roleName }) : t("tasks.role.filledFrom", { role: roleName })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("tasks.role.takenOf", { taken, of })}
            {open && openMin != null && <> · {t("tasks.role.openFor", { count: openMin })}</>}
          </p>
        </div>

        {mayTake && (
          <Button size="sm" onClick={() => take.mutate()} disabled={take.isPending}>
            {take.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Hand className="mr-1.5 size-3.5" />}
            {t("tasks.role.take")}
          </Button>
        )}
        {onIt && notStarted && !returning && (
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
            <Undo2 className="mr-1.5 size-3.5" />
            {t("tasks.role.giveBack")}
          </Button>
        )}
      </div>

      {returning && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={t("tasks.role.reasonPlaceholder")}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => giveBack.mutate()} disabled={giveBack.isPending}>
            {giveBack.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {t("tasks.role.confirmGiveBack")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReturning(false)} aria-label={t("common.cancel")}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {mayAssign && open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-violet-500/20 pt-3 text-xs text-muted-foreground">
          <span>{t("tasks.role.people")}</span>
          <div className="flex h-7 items-center rounded-md border border-border bg-card">
            <button type="button" className="px-1.5 disabled:opacity-40" disabled={setRole.isPending || of <= Math.max(1, taken)} onClick={() => setRole.mutate({ roleId: task.openRoleId!, spots: of - 1 })} aria-label={t("tasks.role.fewer")}>
              <Minus className="size-3" />
            </button>
            <span className="w-5 text-center tabular-nums text-foreground">{of}</span>
            <button type="button" className="px-1.5 disabled:opacity-40" disabled={setRole.isPending || of >= ROLE_SPOTS_MAX} onClick={() => setRole.mutate({ roleId: task.openRoleId!, spots: of + 1 })} aria-label={t("tasks.role.more")}>
              <Plus className="size-3" />
            </button>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={setRole.isPending} onClick={() => setRole.mutate({ roleId: null })}>
            {t("tasks.role.close")}
          </Button>
        </div>
      )}
    </div>
  )
}
