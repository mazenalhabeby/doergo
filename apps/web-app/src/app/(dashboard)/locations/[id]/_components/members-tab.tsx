"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Shield, ShieldCheck, Trash2, Loader2, UserPlus, UserCog, Users, SlidersHorizontal, ChevronDown, Home, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

import { notify } from "@/lib/toast"
import { locationsApi, spaceRolesApi, spaceMembersApi, organizationsApi, spaceUnitsApi, type SpaceUnit } from "@/lib/api"
import { fetchAllPages } from "@/lib/paginate"
import {
  ACCESS_PERMISSION_SCHEMA,
  jobTitleOf,
  type SpaceRoleInSpace,
  type SpaceMember,
  type PermissionSet,
  type AccessPermissionKey,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { MemberRoutingEditor } from "./member-routing-editor"
import { MemberRateChip, MemberRateEditor } from "./member-rate-editor"
import { DatedRateField } from "@/components/rates/dated-rate"
import {
  DEFAULT_ROLE_COLOR,
  RoleCard,
  Segmented,
  roleQueryKey,
  useCents,
} from "./work-roles"
import { MemberBillingMenu, MemberRoleChips } from "./member-role-chips"

const fullName = (p: { firstName?: string | null; lastName?: string | null }) =>
  `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()

const NO_ROLE = "__none__"

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

export function MembersTab({ spaceId, hasApartments }: { spaceId: string; hasApartments?: boolean }) {
  return (
    <div className="space-y-8">
      <SubRolesSection spaceId={spaceId} />
      <Separator />
      <SpaceMembersSection spaceId={spaceId} hasApartments={hasApartments} />
      <Separator />
      <RoutingSection spaceId={spaceId} />
    </div>
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
  const workRoles = (roles ?? []).filter((r) => r.kind === "WORK")
  const mgmtRoles = (roles ?? []).filter((r) => r.kind !== "WORK")

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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeader
          icon={Wrench}
          accent="blue"
          title={t("scheduling.workRoles.workHeading")}
          description={t("scheduling.workRoles.workIntro")}
          action={
            <Button onClick={() => setDialog({ role: null, kind: "WORK" })} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.workRoles.newWork")}
            </Button>
          }
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
          action={
            <Button variant="outline" onClick={() => setDialog({ role: null, kind: "MANAGEMENT" })} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.roles.new")}
            </Button>
          }
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
            {isEdit ? t("scheduling.roles.editTitle") : isWork ? t("scheduling.workRoles.newWork") : t("scheduling.roles.new")}
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

// ── Section (b): Space members ──────────────────────────────────────────────

function SpaceMembersSection({ spaceId, hasApartments }: { spaceId: string; hasApartments?: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRoleId, setSelectedRoleId] = useState(NO_ROLE)
  const [routingOpen, setRoutingOpen] = useState<string | null>(null)
  const [rateOpen, setRateOpen] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<SpaceMember | null>(null)

  const { data: members, isLoading } = useQuery({
    queryKey: ["space-members", spaceId],
    queryFn: () => spaceMembersApi.list(spaceId),
  })
  /*
    Which kind of workspace this is — a rate is only meaningful on a CUSTOMER.
    The same query key the rest of the page uses, so this costs no request.
  */
  const { data: space } = useQuery({
    queryKey: ["location", spaceId],
    queryFn: () => locationsApi.getById(spaceId),
    staleTime: 60_000,
  })
  // Apartments this space owns — for the per-member "lives in" control.
  const { data: unitData } = useQuery({
    queryKey: ["space-member-units", spaceId],
    queryFn: () => spaceUnitsApi.list(spaceId),
    enabled: !!hasApartments,
  })
  const units = unitData ?? []
  /*
    Everyone who could be added — not the first hundred of them.

    The API caps a page at 100, and this asked for one page, so an
    organization with more members than that silently offered a subset: the
    people missing from the picker looked like people who did not exist. Paged
    through instead, with the shared helper's runaway guard still in place.
  */
  /*
    Everyone on the staff — which is NOT what /employees returns.

    That endpoint filters `role: EMPLOYEE`, so it answers "who are the field
    staff" and deliberately excludes admins and managers. Sourcing the
    responsible from it meant the COO could not be chosen to sign off for
    anybody: the one list that had to include leadership was the one that
    excludes it by definition.

    `lite` because this draws a row — a name, an avatar and a label — and has
    no use for Access Profiles or allow-lists.
  */
  const { data: orgPeople } = useQuery({
    queryKey: ["org-people-for-routing"],
    queryFn: () =>
      fetchAllPages((page) =>
        organizationsApi.getMembers({ limit: 200, page, lite: true }),
      ),
  })
  // The same query the roles section reads — one request for the whole tab.
  const { data: roles } = useQuery({
    queryKey: roleQueryKey(spaceId),
    queryFn: () => spaceRolesApi.listInSpace(spaceId),
  })

  const assignedIds = new Set((members || []).map((m) => m.userId))
  /*
    Anyone on the staff can be added to a space, not only field employees.

    This read /employees too, which filters `role: EMPLOYEE` — so an admin or a
    manager could not be added to their own workspace, and neither of the two
    accounts running this business appears in any space. That is not a policy
    anybody chose; it is the shape of an endpoint named for field staff being
    used as if it meant "people".
  */
  const availableEmployees = (orgPeople ?? []).filter(
    (e) => e.isActive !== false && !assignedIds.has(e.id),
  )

  // Names held by more than one of the people on offer — the only case where
  // the email earns its place in the row.
  const duplicateNames = (() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const e of availableEmployees) {
      const n = fullName(e).toLowerCase()
      if (seen.has(n)) dupes.add(n)
      seen.add(n)
    }
    return dupes
  })()

  const assignMutation = useMutation({
    mutationFn: () =>
      spaceMembersApi.assign(spaceId, {
        userId: selectedUserId,
        spaceRoleId: selectedRoleId === NO_ROLE ? null : selectedRoleId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(t("scheduling.members.toast.added"))
      setSelectedUserId("")
      setSelectedRoleId(NO_ROLE)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.members.toast.addFailed")),
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => spaceMembersApi.remove(spaceId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("scheduling.members.toast.removed"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.members.toast.removeFailed")),
  })

  const handleAssign = () => {
    if (!selectedUserId) return notify.error(t("scheduling.members.selectMemberError"))
    assignMutation.mutate()
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={UserCog}
        accent="blue"
        title={t("scheduling.members.heading")}
        description={t("scheduling.members.intro")}
        action={
          members && members.length > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {members.length}
            </Badge>
          ) : undefined
        }
      />

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !members || members.length === 0 ? (
        <EmptyState icon={Users} title={t("scheduling.members.empty")} />
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="rounded-xl border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8">
                    {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                    <AvatarFallback className="text-xs">
                      {(m.user?.firstName?.[0] || "") + (m.user?.lastName?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {m.user ? `${m.user.firstName} ${m.user.lastName}` : t("scheduling.members.unknownMember")}
                      </span>
                      {/*
                        Works for somebody else.

                        This roster is where a space's leadership is read, and it
                        is the one place the distinction actually bites: a client's
                        shift leader and ours hold the SAME role, so without the
                        badge the two are indistinguishable at exactly the moment
                        somebody is choosing who signs off our hours.
                      */}
                      {(m.user as { isExternal?: boolean } | null)?.isExternal && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] font-medium border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0"
                        >
                          {t("members.external.badge")}
                        </Badge>
                      )}
                    </span>
                    {/*
                      What they do, under their name.

                      A roster of names answers "who is in this space" and not
                      "who is the right person for this" — and the second is the
                      question somebody is actually holding when they open it.
                      Same rule as the routing picker, from the same function,
                      so the two can never describe one person differently.
                    */}
                    {jobTitleOf({ position: m.user?.position, memberRole: m.spaceRole }) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {jobTitleOf({ position: m.user?.position, memberRole: m.spaceRole })}
                      </span>
                    )}
                    <MemberRoleChips spaceId={spaceId} member={m} roles={roles ?? []} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasApartments && (
                    <MemberApartmentBadge
                      unit={units.find((u) => u.residentUserId === m.userId) ?? null}
                    />
                  )}
                  {/*
                    ⚠️ A chip, not a field. A rate is read far more often than it
                    is edited and blank is the normal state, so the resting form
                    shows the number that applies and the editor opens on
                    demand — the same shape as Routing beside it.

                    Only on a CUSTOMER workspace: on your own depot there is
                    nobody to bill, and offering it invites somebody to fill it in.
                  */}
                  {/*
                    ⚠️ And never for an EXTERNAL member. They work for a client
                    or a partner, not for us: we neither pay them nor bill their
                    hours, so a rate on them is a number with no meaning — and
                    on a customer workspace, which is where externals most often
                    appear, it would be the most visible field on their row.
                  */}
                  {space?.kind === "CUSTOMER" && m.user?.isExternal !== true && (
                    <MemberRateChip
                      member={m}
                      open={rateOpen === m.id}
                      onToggle={() => setRateOpen(rateOpen === m.id ? null : m.id)}
                    />
                  )}
                  <Button
                    variant={routingOpen === m.id ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setRoutingOpen(routingOpen === m.id ? null : m.id)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t("scheduling.routing.perMember", "Routing")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", routingOpen === m.id && "rotate-180")} />
                  </Button>
                  {/* How this member is billed here, and whether they may hold two roles. */}
                  <MemberBillingMenu spaceId={spaceId} member={m} />
                  {/* Remove is a destructive action, visually separated + confirmed,
                      so it can't be hit by mistake when collapsing the panel. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => setRemoveTarget(m)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">{t("scheduling.members.remove", "Remove")}</span>
                  </Button>
                </div>
              </div>
              {rateOpen === m.id && (
                <MemberRateEditor spaceId={spaceId} member={m} onDone={() => setRateOpen(null)} />
              )}
              {routingOpen === m.id && (
                <MemberRoutingEditor spaceId={spaceId} member={m} roster={members} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign member */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <UserPlus className="h-4 w-4" />
          </span>
          {t("scheduling.members.addHeading")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.member")}</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("scheduling.members.selectMember")} />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">{t("scheduling.members.noAvailable")}</div>
                ) : (
                  availableEmployees.map((e) => {
                    const title = jobTitleOf(e)
                    /*
                      A name on its own is not enough to add the right person.

                      Two accounts for one human is ordinary here — a personal
                      login and an admin one — and this dropdown listed both as
                      the same words, so choosing between them was guesswork.
                      The job title tells them apart on sight; the address is
                      held back until the names actually collide, because beside
                      a unique name it is noise.
                    */
                    const showEmail = duplicateNames.has(fullName(e).toLowerCase())
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="flex flex-col items-start">
                          <span>{fullName(e)}</span>
                          {(title || showEmail) && (
                            <span className="text-xs text-muted-foreground">
                              {[title, showEmail ? e.email : null].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.role")}</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>{t("scheduling.members.noRole")}</SelectItem>
                {/* A trade lands in the work slot, anything else in the management slot. */}
                {([
                  ["WORK", t("scheduling.workRoles.groupWork")],
                  ["MANAGEMENT", t("scheduling.workRoles.groupManagement")],
                ] as const).map(([kind, label]) => {
                  const group = (roles || []).filter((r) => (r.kind === "WORK") === (kind === "WORK"))
                  if (group.length === 0) return null
                  return (
                    <SelectGroup key={kind}>
                      <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</SelectLabel>
                      {group.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleAssign}
          disabled={!selectedUserId || assignMutation.isPending}
          size="sm"
          className="gap-1.5"
        >
          {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {t("scheduling.members.addButton")}
        </Button>
      </div>

      {/* Confirm before removing — prevents accidental removal (the old X next to
          Routing was easy to hit while trying to collapse the panel). */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduling.members.removeTitle", "Remove from workspace?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("scheduling.members.removeConfirm", "{{name}} will lose their role and routing in this workspace. This does not remove them from the organization.", {
                name: removeTarget?.user ? `${removeTarget.user.firstName} ${removeTarget.user.lastName}` : t("scheduling.members.unknownMember"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                if (!removeTarget) return
                if (routingOpen === removeTarget.id) setRoutingOpen(null)
                removeMutation.mutate(removeTarget.id, { onSuccess: () => setRemoveTarget(null) })
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("scheduling.members.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Where a member lives, as information ─────────────────────────────────────
//
// Read-only on purpose. This row is about membership and routing; housing is a
// different question, and it is already answered from the apartment itself —
// the thing being allocated, and the only surface that can show whether it is
// free and who is in it. Two editable controls writing one field meant an
// apartment could be reassigned from a screen that never showed its occupant.
//
// Nothing renders when nobody is housed. A "Vacant" control on every row of a
// workspace that houses no one is noise standing in for an answer.

function MemberApartmentBadge({ unit }: { unit: SpaceUnit | null }) {
  const { t } = useTranslation()
  if (!unit) return null
  return (
    <span
      className="inline-flex max-w-[150px] items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
      title={t("apartments.residentOf", "Lives in {{name}}", { name: unit.name })}
    >
      <Home className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{unit.name}</span>
    </span>
  )
}
