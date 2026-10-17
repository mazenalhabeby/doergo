"use client"

import { keys, invalidateTask } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, UsersRound } from "lucide-react"
import { isWorkOver } from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { tasksApi, type Task } from "@/lib/api"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { RoleAssignField, type RoleAssignValue } from "../../_components/role-assign-field"
import { useWorkspaceWorkRoles } from "@/hooks/use-workspace-work-roles"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"

/**
 * "Open to a role" on an EXISTING task (shared tasks/role-pool.ts) — the case
 * that comes after creation: the person named is off, declined, or nobody is
 * free, and any Mechanic may take it. Same picker as New Task, same server path
 * (PUT /tasks/:id/open-role): people already on the task count as places taken.
 *
 * Nothing is fetched until the dialog opens — the role list and "who is free
 * now" are read by the picker inside it.
 */
export function OpenToRoleAction({ task, canAssign }: { task: Task & { spaceId?: string | null }; canAssign: boolean }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<RoleAssignValue>({ roleId: null, spots: 1 })
  // Only offered where the workspace HAS work roles — asked once per workspace (cached), and only of an assigner.
  const relevant = canAssign && !!task.spaceId && !task.openRoleId && !isWorkOver(task.status)
  // A small sidebar action, asked after the page has loaded (useAfterFirstLoad).
  const afterFirstLoad = useAfterFirstLoad(2)
  const { hasRoles } = useWorkspaceWorkRoles(task.spaceId, relevant && afterFirstLoad)

  const save = useMutation({
    mutationFn: () => tasksApi.setOpenRole(task.id, { roleId: value.roleId, spots: value.spots }),
    onSuccess: () => {
      notify.success(t("tasks.role.openedNow"))
      setOpen(false)
      invalidateTask(queryClient, task.id)
      queryClient.invalidateQueries({ queryKey: keys.spaces.roleStats() })
    },
    onError: (e) => notify.error(serverErrorMessage(e, t, i18n.language)),
  })

  // Only where it means something: a task in a workspace with work roles, not finished, not already open to a role.
  if (!relevant || !hasRoles) return null

  return (
    <>
      <button
        type="button"
        onClick={() => { setValue({ roleId: null, spots: 1 }); setOpen(true) }}
        className={"mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs " +
          "text-muted-foreground transition-colors hover:bg-muted/60 " +
          "hover:text-foreground"}
      >
        <UsersRound className="size-3.5" />
        {t("tasks.role.openExisting")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tasks.role.openExisting")}</DialogTitle>
            <DialogDescription>{t("tasks.role.openExistingHint")}</DialogDescription>
          </DialogHeader>
          {open && (
            <RoleAssignField
              spaceId={task.spaceId!}
              lat={task.locationLat ?? null}
              lng={task.locationLng ?? null}
              value={value}
              onChange={setValue}
              disabled={save.isPending}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={!value.roleId || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t("tasks.role.openNowButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
