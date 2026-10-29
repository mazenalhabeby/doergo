"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Shield, ShieldCheck, Loader2, Wrench } from "lucide-react"
import { type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { SectionHeader, EmptyState } from "../../../../../components/common/section-header"
import { RoleDialog } from "./space-role-dialog"
import { AddRoleHereDialog } from "./add-role-here-dialog"
import { RoleCard, roleQueryKey, useSpaceCurrency } from "@/components/spaces/work-roles"

/** The workspace's roles: work roles with their day rate here, and management roles. */
// ── Section (a): roles in this workspace ─────────────────────────────────────
//
// Two lists, because they are two different things. WORK roles are trades —
// they carry how the work is billed and a day rate HERE, and grant nothing.
// MANAGEMENT roles carry permissions. Each card says who holds it here, so
// "who is a Mechanic at BILLA" is answered on the card rather than by reading
// down the member list.

export function SubRolesSection({ spaceId }: { spaceId: string }) {
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

  /*
    ONE "New role" button. The two section buttons opened the same dialog with
    a different kind pre-selected — and the dialog asks the kind anyway.
  */
  return (
    <div className="space-y-6">
      {/* ONE way in: pick a company role for this workspace, or create a new one — in the same dialog. */}
      <div className="flex justify-end">
        <Button onClick={() => setPicking(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("scheduling.workRoles.addHere")}
        </Button>
      </div>
      <div className="space-y-3">
        <SectionHeader
          icon={Wrench}
          accent="blue"
          title={t("scheduling.workRoles.workHeading")}
          description={t("scheduling.workRoles.workIntro")}
        />
        {duplicates.map((g) => (
          <div
            key={g[0].id}
            className={
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border " +
              "border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 " +
              "dark:text-amber-300"
            }
          >
            <span>{t("scheduling.workRoles.duplicateNotice", { count: g.length, name: g[0].name })}</span>
            <Button size="sm" variant="outline" disabled={combine.isPending} onClick={() => combine.mutate(g)}>
              {combine.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("scheduling.workRoles.combine")}
            </Button>
          </div>
        ))}
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : workRoles.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={t("scheduling.workRoles.noneHere")}
            description={t("scheduling.workRoles.noneHereHint")}
          />
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
              : t("scheduling.membersPage.showUnused", {
                  count: unused.length,
                  names: unused.map((r) => r.name).join(", "),
                })}
          </button>
        )}
      </div>

      <AddRoleHereDialog
        spaceId={spaceId}
        open={picking}
        onOpenChange={setPicking}
        notHere={notHere}
        duplicates={duplicates}
        onDelete={setDeleteTarget}
        onCreateNew={() => setDialog({ role: null, kind: "WORK" })}
      />

      {dialog && (
        <RoleDialog
          spaceId={spaceId}
          allRoles={roles ?? []}
          // The LIVE role from the list, not the snapshot taken when it opened —
          // or a day rate changed inside the dialog shows its old figure until a reload.
          role={dialog.role ? ((roles ?? []).find((r) => r.id === dialog.role!.id) ?? dialog.role) : null}
          defaultKind={dialog.kind}
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null)
          }}
        />
      )}

      <ConfirmTargetDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("scheduling.roles.deleteTitle")}
        description={t("scheduling.roles.deleteConfirm", { name: deleteTarget?.name })}
        confirmLabel={t("common.delete")}
        mutation={removeMutation}
      />
    </div>
  )
}
