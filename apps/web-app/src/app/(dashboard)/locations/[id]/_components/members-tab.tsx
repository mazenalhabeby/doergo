"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Shield, ShieldCheck, Pencil, Trash2, Loader2, UserPlus, UserCog, Users, Lock, SlidersHorizontal, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

import { notify } from "@/lib/toast"
import { spaceRolesApi, spaceMembersApi, employeesApi } from "@/lib/api"
import {
  SPACE_ROLE_PERMISSION_SCHEMA,
  type SpaceRole,
  type SpaceMember,
  type SpaceRolePermissions,
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

const DEFAULT_ROLE_COLOR = "#2563eb"
const NO_ROLE = "__none__"

const emptyPermissions = (): SpaceRolePermissions =>
  SPACE_ROLE_PERMISSION_SCHEMA.reduce((acc, p) => {
    acc[p.key] = false
    return acc
  }, {} as SpaceRolePermissions)

export function MembersTab({ spaceId }: { spaceId: string }) {
  return (
    <div className="space-y-8">
      <SubRolesSection />
      <Separator />
      <SpaceMembersSection spaceId={spaceId} />
      <Separator />
      <RoutingSection spaceId={spaceId} />
    </div>
  )
}

// ── Section (a): Space sub-roles ────────────────────────────────────────────

function SubRolesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SpaceRole | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SpaceRole | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: ["space-roles"],
    queryFn: () => spaceRolesApi.list(),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => spaceRolesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-roles"] })
      setDeleteTarget(null)
      notify.success(t("scheduling.roles.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.roles.toast.deleteFailed")),
  })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={ShieldCheck}
        accent="violet"
        title={t("scheduling.roles.heading")}
        description={t("scheduling.roles.intro")}
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
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
      ) : !roles || roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t("scheduling.roles.empty.title")}
          description={t("scheduling.roles.empty.description")}
          action={
            <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.roles.new")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const activePerms = SPACE_ROLE_PERMISSION_SCHEMA.filter((p) => role.permissions?.[p.key])
            return (
              <div
                key={role.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `${role.color || DEFAULT_ROLE_COLOR}20` }}>
                    <Shield className="h-4 w-4" style={{ color: role.color || DEFAULT_ROLE_COLOR }} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{role.name}</span>
                      {role.isSystem && (
                        <Badge
                          variant="outline"
                          className="text-[11px] gap-1 border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Lock className="h-3 w-3" />
                          {t("scheduling.roles.builtIn")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {activePerms.length > 0
                        ? activePerms.map((p) => t(`scheduling.roles.permissions.${p.key}.label`)).join(" · ")
                        : t("scheduling.roles.noPermissions")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTarget(role); setDialogOpen(true) }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!role.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => setDeleteTarget(role)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogOpen && (
        <RoleDialog role={editTarget} open={dialogOpen} onOpenChange={setDialogOpen} />
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
  role,
  open,
  onOpenChange,
}: {
  role: SpaceRole | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!role

  const [name, setName] = useState(role?.name || "")
  const [description, setDescription] = useState(role?.description || "")
  const [color, setColor] = useState(role?.color || DEFAULT_ROLE_COLOR)
  const [permissions, setPermissions] = useState<SpaceRolePermissions>(
    role?.permissions || emptyPermissions(),
  )

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), description: description.trim() || undefined, color, permissions }
      return isEdit ? spaceRolesApi.update(role!.id, payload) : spaceRolesApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-roles"] })
      notify.success(isEdit ? t("scheduling.roles.toast.updated") : t("scheduling.roles.toast.created"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.roles.toast.saveFailed")),
  })

  const togglePerm = (key: keyof SpaceRolePermissions) =>
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("scheduling.roles.nameRequired"))
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("scheduling.roles.editTitle") : t("scheduling.roles.new")}</DialogTitle>
          <DialogDescription>{t("scheduling.roles.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">{t("scheduling.roles.fields.name")}</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("scheduling.roles.namePlaceholder")} />
          </div>
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

          <div className="space-y-2">
            <Label>{t("scheduling.roles.fields.permissions")}</Label>
            <div className="space-y-2">
              {SPACE_ROLE_PERMISSION_SCHEMA.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={permissions[perm.key]}
                    onCheckedChange={() => togglePerm(perm.key)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t(`scheduling.roles.permissions.${perm.key}.label`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`scheduling.roles.permissions.${perm.key}.description`)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
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

function SpaceMembersSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRoleId, setSelectedRoleId] = useState(NO_ROLE)
  const [routingOpen, setRoutingOpen] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<SpaceMember | null>(null)

  const { data: members, isLoading } = useQuery({
    queryKey: ["space-members", spaceId],
    queryFn: () => spaceMembersApi.list(spaceId),
  })
  const { data: employeeData } = useQuery({
    queryKey: ["employees-for-space-members"],
    queryFn: () => employeesApi.list({ limit: 100, status: "active" }),
  })
  const { data: roles } = useQuery({
    queryKey: ["space-roles"],
    queryFn: () => spaceRolesApi.list(),
  })

  const assignedIds = new Set((members || []).map((m) => m.userId))
  const availableEmployees = (employeeData?.data || []).filter((e) => !assignedIds.has(e.id))

  const assignMutation = useMutation({
    mutationFn: () =>
      spaceMembersApi.assign(spaceId, {
        userId: selectedUserId,
        spaceRoleId: selectedRoleId === NO_ROLE ? null : selectedRoleId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
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
                    <span className="text-sm font-medium text-foreground truncate block">
                      {m.user ? `${m.user.firstName} ${m.user.lastName}` : t("scheduling.members.unknownMember")}
                    </span>
                    {m.spaceRole && (
                      <Badge
                        variant="outline"
                        className="text-[11px] mt-0.5"
                        style={m.spaceRole.color ? { borderColor: `${m.spaceRole.color}66`, color: m.spaceRole.color } : undefined}
                      >
                        {m.spaceRole.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                  availableEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))
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
                {(roles || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
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
            <AlertDialogTitle>{t("scheduling.members.removeTitle", "Remove from space?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("scheduling.members.removeConfirm", "{{name}} will lose their role and routing in this space. This does not remove them from the organization.", {
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
