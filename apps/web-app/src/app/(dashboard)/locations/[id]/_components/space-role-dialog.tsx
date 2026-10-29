"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { type SpaceRoleInSpace, type PermissionSet, type AccessPermissionKey } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DEFAULT_ROLE_COLOR, Segmented, roleQueryKey } from "@/components/spaces/work-roles"
import { RoleDayRates } from "./role-day-rates"
import { RolePermissionPicker, SPACE_PERMISSIONS } from "./role-permission-picker"
import { MergeRoleSection } from "./merge-role-section"

const emptyPermissions = (): PermissionSet =>
  SPACE_PERMISSIONS.reduce((acc, p) => {
    acc[p.key] = false
    return acc
  }, {} as PermissionSet)

/** Create or edit a workspace role — a trade (work role) or a management role and its permissions. */
export function RoleDialog({
  spaceId,
  allRoles,
  role,
  defaultKind,
  open,
  onOpenChange,
}: {
  spaceId: string
  /** Every role in the company — a name that exists is offered, not made twice. */
  allRoles: SpaceRoleInSpace[]
  role: SpaceRoleInSpace | null
  defaultKind: "WORK" | "MANAGEMENT"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("scheduling.roles.editTitle") : t("scheduling.roles.new")}</DialogTitle>
          <DialogDescription>
            {isWork ? t("scheduling.workRoles.workIntro") : t("scheduling.roles.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">{t("scheduling.roles.fields.name")}</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("scheduling.roles.namePlaceholder")}
            />
            {clash && (
              <div
                className={
                  "flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 " +
                  "bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
                }
              >
                <span>{t("scheduling.workRoles.nameExists", { name: clash.name })}</span>
                {clash.kind === "WORK" && clash.activeHere === false && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={useExisting.isPending}
                    onClick={() => useExisting.mutate(clash.id)}
                  >
                    {t("scheduling.workRoles.useNamedHere", { name: clash.name })}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("scheduling.workRoles.kind")}</Label>
            <div>
              <Segmented
                ariaLabel={t("scheduling.workRoles.kind")}
                value={kind}
                onChange={setKind}
                disabled={kindLocked}
                options={[
                  { value: "WORK", label: t("scheduling.workRoles.kindWork") },
                  { value: "MANAGEMENT", label: t("scheduling.workRoles.kindManagement") },
                ]}
              />
            </div>
            {kindLocked && (
              <p className="text-xs text-muted-foreground">
                {role!.isSystem
                  ? t("scheduling.workRoles.kindBuiltIn")
                  : t("scheduling.workRoles.kindLocked", { count: role!.inUseCount })}
              </p>
            )}
          </div>

          {isWork && !isEdit && (
            <div className="space-y-2">
              <Label htmlFor="role-day-rate">{t("scheduling.workRoles.initialDayRate")}</Label>
              <div className="relative max-w-[12rem]">
                <Input
                  id="role-day-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={initialDayRate}
                  onChange={(e) => setInitialDayRate(e.target.value)}
                  className="pr-14 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {t("scheduling.workRoles.perDay")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("scheduling.workRoles.dayRateHint")}</p>
            </div>
          )}

          {isWork && isEdit && <RoleDayRates role={role!} spaceId={spaceId} />}

          <div className="space-y-2">
            <Label htmlFor="role-desc">{t("scheduling.roles.fields.description")}</Label>
            <Textarea id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-color">{t("scheduling.roles.fields.color")}</Label>
            <div className="flex items-center gap-2">
              <input
                id="role-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent"
              />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
          </div>

          {isWork ? (
            /* A trade grants nothing — said, not merely hidden. */
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("scheduling.workRoles.grantsNothing")}
            </p>
          ) : (
            <RolePermissionPicker permissions={permissions} togglePerm={togglePerm} />
          )}
        </div>

        <MergeRoleSection spaceId={spaceId} role={role} allRoles={allRoles} onOpenChange={onOpenChange} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
