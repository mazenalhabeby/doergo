"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Shield,
  ShieldCheck,
  Loader2,
  Wrench,
} from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceRolesApi, spaceMembersApi } from "@/lib/api"
import {
  ACCESS_PERMISSION_SCHEMA,
  type SpaceRoleInSpace,
  type PermissionSet,
  type AccessPermissionKey,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { SectionHeader, EmptyState } from "./section-header"
import { RoutingSection } from "./routing-section"
import { DatedRateField } from "@/components/rates/dated-rate"
import {
  DEFAULT_ROLE_COLOR,
  RoleCard,
  Segmented,
  roleQueryKey,
  useCents,
} from "./work-roles"
import { PeopleSection } from "./members-people"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"


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
const SPACE_PERMISSIONS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes("space"))

/** Grouped by domain, so twenty checkboxes read as five short subjects. */
const SPACE_PERMISSION_DOMAINS = [...new Set(SPACE_PERMISSIONS.map((p) => p.domain))]

const emptyPermissions = (): PermissionSet =>
  SPACE_PERMISSIONS.reduce((acc, p) => {
    acc[p.key] = false
    return acc
  }, {} as PermissionSet)

/**
 * A workspace's Members page, in three tabs.
 *
 * It used to be one long scroll — roles above, every member with chips, a rate,
 * Routing, ⋯ and Remove on their row, the add form, then routing — and it grew
 * with every feature. People is the everyday view (a table to read, a side
 * panel to work in); Roles and Notifications are set up once and visited rarely.
 */
export function MembersTab({ spaceId, hasApartments }: { spaceId: string; hasApartments?: boolean }) {
  const { t } = useTranslation()
  const { data: members } = useQuery({ queryKey: ["space-members", spaceId], queryFn: () => spaceMembersApi.list(spaceId) })
  const { data: roles } = useQuery({ queryKey: roleQueryKey(spaceId), queryFn: () => spaceRolesApi.listInSpace(spaceId) })
  const count = (n?: number) => (n != null ? <span className="ml-1.5 text-[11px] text-muted-foreground">{n}</span> : null)
  return (
    <Tabs defaultValue="people" className="space-y-4">
      <TabsList className="h-auto rounded-lg border bg-muted/50 p-0.5">
        <TabsTrigger value="people" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.people")}{count(members?.length)}
        </TabsTrigger>
        <TabsTrigger value="roles" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.roles")}{count(roles?.filter((r) => r.holders.length > 0 || !r.isSystem).length)}
        </TabsTrigger>
        <TabsTrigger value="notifications" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.notifications")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="people" className="mt-0">
        <PeopleSection spaceId={spaceId} hasApartments={hasApartments} />
      </TabsContent>
      <TabsContent value="roles" className="mt-0">
        <SubRolesSection spaceId={spaceId} />
      </TabsContent>
      <TabsContent value="notifications" className="mt-0">
        <RoutingSection spaceId={spaceId} />
      </TabsContent>
    </Tabs>
  )
}

// ── Section (a): roles in this workspace ─────────────────────────────────────
//
// Two lists, because they are two different things. WORK roles are trades —
// they carry how the work is billed and a day rate HERE, and grant nothing.
// MANAGEMENT roles carry permissions. Each card says who holds it here, so
// "who is a Mechanic at BILLA" is answered on the card rather than by reading
// down the member list.

function SubRolesSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ role: SpaceRoleInSpace | null; kind: "WORK" | "MANAGEMENT" } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SpaceRoleInSpace | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: roleQueryKey(spaceId),
    queryFn: () => spaceRolesApi.listInSpace(spaceId),
  })
  const [showUnused, setShowUnused] = useState(false)
  const workRoles = (roles ?? []).filter((r) => r.kind === "WORK")
  const allMgmt = (roles ?? []).filter((r) => r.kind !== "WORK")
  // Built-in roles nobody holds here are folded away — they exist in every workspace.
  const unused = allMgmt.filter((r) => r.isSystem && r.holders.length === 0)
  const mgmtRoles = showUnused ? allMgmt : allMgmt.filter((r) => !unused.includes(r))

  const removeMutation = useMutation({
    mutationFn: (id: string) => spaceRolesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: ["space-roles"] })
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
          onEdit={() => setDialog({ role, kind: role.kind === "WORK" ? "WORK" : "MANAGEMENT" })}
          onDelete={() => setDeleteTarget(role)}
        />
      ))}
    </div>
  )

  /*
    ONE "New role" button. The two section buttons opened the same dialog with
    a different kind pre-selected — and the dialog asks the kind anyway.
  */
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setDialog({ role: null, kind: "WORK" })} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("scheduling.roles.new")}
        </Button>
      </div>
      <div className="space-y-3">
        <SectionHeader
          icon={Wrench}
          accent="blue"
          title={t("scheduling.workRoles.workHeading")}
          description={t("scheduling.workRoles.workIntro")}
        />
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : workRoles.length === 0 ? (
          <EmptyState icon={Wrench} title={t("scheduling.workRoles.nobodyHere")} description={t("scheduling.workRoles.workIntro")} />
        ) : (
          list(workRoles)
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader
          icon={ShieldCheck}
          accent="violet"
          title={t("scheduling.workRoles.managementHeading")}
          description={t("scheduling.workRoles.managementIntro")}
        />
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : mgmtRoles.length === 0 ? (
          <EmptyState
            icon={Shield}
            title={t("scheduling.roles.empty.title")}
            description={t("scheduling.roles.empty.description")}
          />
        ) : (
          list(mgmtRoles)
        )}
        {unused.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUnused((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showUnused
              ? t("scheduling.membersPage.hideUnused")
              : t("scheduling.membersPage.showUnused", { count: unused.length, names: unused.map((r) => r.name).join(", ") })}
          </button>
        )}
      </div>

      {dialog && (
        <RoleDialog
          spaceId={spaceId}
          role={dialog.role}
          defaultKind={dialog.kind}
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduling.roles.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("scheduling.roles.deleteConfirm", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); if (deleteTarget) removeMutation.mutate(deleteTarget.id) }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RoleDialog({
  spaceId,
  role,
  defaultKind,
  open,
  onOpenChange,
}: {
  spaceId: string
  role: SpaceRoleInSpace | null
  defaultKind: "WORK" | "MANAGEMENT"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const cents = useCents()
  const isEdit = !!role

  const [name, setName] = useState(role?.name || "")
  const [description, setDescription] = useState(role?.description || "")
  const [color, setColor] = useState(role?.color || DEFAULT_ROLE_COLOR)
  const [kind, setKind] = useState<"WORK" | "MANAGEMENT">(role?.kind === "WORK" ? "WORK" : role ? "MANAGEMENT" : defaultKind)
  const [initialDayRate, setInitialDayRate] = useState("")
  const [permissions, setPermissions] = useState<PermissionSet>(
    role?.permissions || emptyPermissions(),
  )

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
      const saved = isEdit ? await spaceRolesApi.update(role!.id, payload) : await spaceRolesApi.create(payload)
      // A new trade can start with a day rate here, from today.
      if (!isEdit && isWork && saved?.id && initialDayRate.trim() !== "") {
        await spaceRolesApi.setDayRate(spaceId, saved.id, { cents: Math.round(Number(initialDayRate) * 100) })
      }
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: ["space-roles"] })
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(isEdit ? t("scheduling.roles.toast.updated") : t("scheduling.roles.toast.created"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.roles.toast.saveFailed")),
  })

  const togglePerm = (key: AccessPermissionKey) =>
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("scheduling.roles.nameRequired"))
    if (initialDayRate.trim() !== "" && !(Number(initialDayRate) >= 0)) return
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("scheduling.roles.editTitle") : t("scheduling.roles.new")}
          </DialogTitle>
          <DialogDescription>
            {isWork ? t("scheduling.workRoles.workIntro") : t("scheduling.roles.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">{t("scheduling.roles.fields.name")}</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("scheduling.roles.namePlaceholder")} />
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

          {isWork && isEdit && (
            <div className="space-y-4">
              {/* This workspace's own rate — and, below it, the default every other workspace uses. */}
              <DatedRateField
                id="role-day-rate-here"
                label={t("scheduling.workRoles.dayRateHere")}
                hint={t("scheduling.workRoles.dayRateHint")}
                unit="day"
                currentCents={role!.dayRateSource === "workspace" ? role!.dayRateCents : null}
                emptyLabel={
                  role!.defaultDayRateCents != null
                    ? t("rates.usesDefault", { rate: `${cents(role!.defaultDayRateCents)} ${t("rates.perDay")}` })
                    : undefined
                }
                history={role!.dayRateHistory}
                onSubmit={async (c, from) => {
                  await spaceRolesApi.setDayRate(spaceId, role!.id, { cents: c, ...(from ? { effectiveFrom: from } : {}) })
                  queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
                }}
              />
              <DatedRateField
                id="role-day-rate-default"
                label={t("rates.defaultDayRate")}
                hint={t("rates.defaultDayRateHint")}
                unit="day"
                currentCents={role!.defaultDayRateCents ?? null}
                history={role!.defaultDayRateHistory ?? []}
                onSubmit={async (c, from) => {
                  await spaceRolesApi.setDefaultDayRate(role!.id, { cents: c, ...(from ? { effectiveFrom: from } : {}) })
                  queryClient.invalidateQueries({ queryKey: ["space-roles-in-space"] })
                }}
              />
            </div>
          )}

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
            <div className="space-y-2">
              <Label>{t("scheduling.roles.fields.permissions")}</Label>
              <div className="space-y-4">
                {SPACE_PERMISSION_DOMAINS.map((domain) => (
                  <div key={domain}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`roles.domains.${domain}`, domain)}
                    </p>
                    <div className="space-y-1.5">
                      {SPACE_PERMISSIONS.filter((p) => p.domain === domain).map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <Checkbox
                            checked={permissions[perm.key] === true}
                            onCheckedChange={() => togglePerm(perm.key)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            {/*
                              The catalogue's own label and description are the
                              fallback, so a newly added permission is readable
                              here the day it exists rather than rendering its key.
                            */}
                            <p className="text-sm font-medium text-foreground">
                              {t(`scheduling.roles.permissions.${perm.key}.label`, perm.label)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t(`scheduling.roles.permissions.${perm.key}.description`, perm.description)}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
