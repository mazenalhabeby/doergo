"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import { type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { RoleCard, roleQueryKey, useSpaceCurrency } from "./work-roles"

/** SubRolesSection's state and handlers — everything before its markup, moved here unchanged. */
export function useSubRolesSection({ spaceId }: Pick<{ spaceId: string }, "spaceId">) {
  const money = useSpaceCurrency(spaceId)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ role: SpaceRoleInSpace | null; kind: "WORK" | "MANAGEMENT" } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SpaceRoleInSpace | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: roleQueryKey(spaceId),
    queryFn: () => spaceRolesApi.listInSpace(spaceId),
  })
  const [showUnused, setShowUnused] = useState(false)
  /*
    Roles are one list for the company; a workspace shows only the work roles
    it has switched on. "Add a role" offers the rest, or a new one.
  */
  const allWork = (roles ?? []).filter((r) => r.kind === "WORK")
  const workRoles = allWork.filter((r) => r.activeHere !== false)
  const notHere = allWork.filter((r) => r.activeHere === false)
  const [picking, setPicking] = useState(false)
  /*
    Two roles with one name are a duplicate made before names had to be unique
    (one priced in this workspace, one in another). Say so, and fix it in one
    click: keep the one people hold (else the oldest), fold the rest into it —
    their day rates move over, per workspace.
  */
  const duplicates = Object.values(
    allWork.reduce<Record<string, SpaceRoleInSpace[]>>((acc, r) => {
      const k = r.name.trim().toLowerCase()
      ;(acc[k] ??= []).push(r)
      return acc
    }, {}),
  ).filter((g) => g.length > 1)
  const combine = useMutation({
    mutationFn: async (group: SpaceRoleInSpace[]) => {
      const keep = [...group].sort((a, b) => b.inUseCount - a.inUseCount)[0]
      for (const r of group) if (r.id !== keep.id) await spaceRolesApi.merge(r.id, keep.id)
    },
    onSuccess: () => {
      refreshRoles()
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(t("scheduling.workRoles.merged"))
    },
    onError: (err: Error) => notify.error(err.message),
  })
  const refreshRoles = () => {
    queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
    queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
  }
  const useHere = useMutation({
    mutationFn: (roleId: string) => spaceRolesApi.useHere(spaceId, roleId),
    onSuccess: () => {
      refreshRoles()
      setPicking(false)
      notify.success(t("scheduling.workRoles.addedHere"))
    },
    onError: (err: Error) => notify.error(err.message),
  })
  const dropHere = useMutation({
    mutationFn: (roleId: string) => spaceRolesApi.dropHere(spaceId, roleId),
    onSuccess: () => {
      refreshRoles()
      notify.success(t("scheduling.workRoles.removedHere"))
    },
    onError: (err: Error) => notify.error(err.message),
  })
  const allMgmt = (roles ?? []).filter((r) => r.kind !== "WORK")
  // Built-in roles nobody holds here are folded away — they exist in every workspace.
  const unused = allMgmt.filter((r) => r.isSystem && r.holders.length === 0)
  const mgmtRoles = showUnused ? allMgmt : allMgmt.filter((r) => !unused.includes(r))

  const removeMutation = useMutation({
    mutationFn: (id: string) => spaceRolesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
      setDeleteTarget(null)
      notify.success(t("scheduling.roles.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.roles.toast.deleteFailed")),
  })

  const list = (items: SpaceRoleInSpace[]) => (
    <div className="space-y-2">
      {items.map((role) => (
        <RoleCard
          key={role.id}
          role={role}
          currency={money.bill}
          onEdit={() => setDialog({ role, kind: role.kind === "WORK" ? "WORK" : "MANAGEMENT" })}
          // A work role leaves THIS workspace; deleting it everywhere is not done from here.
          {...(role.kind === "WORK"
            ? { onRemoveHere: () => dropHere.mutate(role.id) }
            : { onDelete: () => setDeleteTarget(role) })}
        />
      ))}
    </div>
  )

  return {
    money,
    t,
    dialog,
    setDialog,
    deleteTarget,
    setDeleteTarget,
    roles,
    isLoading,
    showUnused,
    setShowUnused,
    workRoles,
    notHere,
    picking,
    setPicking,
    duplicates,
    combine,
    useHere,
    unused,
    mgmtRoles,
    removeMutation,
    list,
  }
}
