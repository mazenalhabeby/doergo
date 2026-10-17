"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import {
  ACCESS_PERMISSION_SCHEMA,
  type SpaceRoleInSpace,
  type PermissionSet,
  type AccessPermissionKey,
} from "@hbcfield/shared/client"
import { DEFAULT_ROLE_COLOR, roleQueryKey, useCents, useSpaceCurrency } from "./work-roles"

/** Create or edit a workspace role and its permissions. */
/*
  What a space role can grant — derived, not listed.

  This screen offered four attendance permissions, which is what a space role
  meant before the unified access model. It has meant more than that for a
  while: the server whitelists whatever ACCESS_PERMISSION_SCHEMA marks as
  grantable on a space, and resolveAccess honours all of them per space. So the
  other twelve — tasks, CRM, reports, assets, tracking, members — were storable
  and enforced, and simply could not be ticked.

  Derived from the same constant the server filters on, so the two cannot drift
  again: adding a permission to the catalogue with scopes ['org','space'] makes
  it appear here, and nowhere is there a second list to remember.
*/
export const SPACE_PERMISSIONS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes("space"))

export const emptyPermissions = (): PermissionSet =>
  SPACE_PERMISSIONS.reduce((acc, p) => {
    acc[p.key] = false
    return acc
  }, {} as PermissionSet)

/** RoleDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useRoleDialog({
  spaceId,
  allRoles,
  role,
  defaultKind,
  open,
  onOpenChange,
}: Pick<
  {
    spaceId: string
    /** Every role in the company — a name that exists is offered, not made twice. */
    allRoles: SpaceRoleInSpace[]
    role: SpaceRoleInSpace | null
    defaultKind: "WORK" | "MANAGEMENT"
    open: boolean
    onOpenChange: (open: boolean) => void
  },
  "spaceId" | "allRoles" | "role" | "defaultKind" | "open" | "onOpenChange"
>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const money = useSpaceCurrency(spaceId)
  const cents = useCents(money.bill)
  const [showDefault, setShowDefault] = useState(false)
  const isEdit = !!role

  const [name, setName] = useState(role?.name || "")
  const [description, setDescription] = useState(role?.description || "")
  const [color, setColor] = useState(role?.color || DEFAULT_ROLE_COLOR)
  const [kind, setKind] = useState<"WORK" | "MANAGEMENT">(
    role?.kind === "WORK" ? "WORK" : role ? "MANAGEMENT" : defaultKind,
  )
  const [initialDayRate, setInitialDayRate] = useState("")
  const [permissions, setPermissions] = useState<PermissionSet>(role?.permissions || emptyPermissions())

  // A name that already exists (any case) is the existing role: offer it, never make a second.
  const clash = name.trim()
    ? allRoles.find((r) => r.id !== role?.id && r.name.trim().toLowerCase() === name.trim().toLowerCase())
    : undefined
  const useExisting = useMutation({
    mutationFn: (id: string) => spaceRolesApi.useHere(spaceId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(t("scheduling.workRoles.addedHere"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message),
  })
  // Merging a duplicate trade into another: holders and day rates move.
  const mergeTargets =
    isEdit && role!.kind === "WORK" && !role!.isSystem
      ? allRoles.filter((r) => r.kind === "WORK" && r.id !== role!.id)
      : []
  const [mergeInto, setMergeInto] = useState<string>("")
  const [confirmMerge, setConfirmMerge] = useState(false)
  const merge = useMutation({
    mutationFn: () => spaceRolesApi.merge(role!.id, mergeInto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(t("scheduling.workRoles.merged"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message),
  })

  // The kind moves only while nobody holds the role — the server says the same.
  const kindLocked = isEdit && (role!.isSystem || role!.inUseCount > 0)
  const isWork = kind === "WORK"

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        kind,
        ...(isWork ? {} : { permissions }),
      }
      // Made here: a work role is switched on in this workspace at once.
      const saved = isEdit
        ? await spaceRolesApi.update(role!.id, payload)
        : await spaceRolesApi.create({ ...payload, spaceId })
      // A new trade can start with a day rate here, from today.
      if (!isEdit && isWork && saved?.id && initialDayRate.trim() !== "") {
        await spaceRolesApi.setDayRate(spaceId, saved.id, { cents: Math.round(Number(initialDayRate) * 100) })
      }
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(isEdit ? t("scheduling.roles.toast.updated") : t("scheduling.roles.toast.created"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.roles.toast.saveFailed")),
  })

  const togglePerm = (key: AccessPermissionKey) => setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("scheduling.roles.nameRequired"))
    if (clash) return notify.error(t("scheduling.workRoles.nameExists", { name: clash.name }))
    if (initialDayRate.trim() !== "" && !(Number(initialDayRate) >= 0)) return
    mutation.mutate()
  }

  return {
    t,
    queryClient,
    money,
    cents,
    showDefault,
    setShowDefault,
    isEdit,
    name,
    setName,
    description,
    setDescription,
    color,
    setColor,
    kind,
    setKind,
    initialDayRate,
    setInitialDayRate,
    permissions,
    clash,
    useExisting,
    mergeTargets,
    mergeInto,
    setMergeInto,
    confirmMerge,
    setConfirmMerge,
    merge,
    kindLocked,
    isWork,
    mutation,
    togglePerm,
    handleSave,
  }
}

/** What RoleDialog and its sections read. */
export type RoleDialogState = ReturnType<typeof useRoleDialog>
