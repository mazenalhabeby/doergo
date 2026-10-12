"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, SlidersHorizontal } from "lucide-react"

import {
  isAdmin,
  permissionsFromChoice,
  personName,
  readAccessDraft,
  serializeAccessDraft,
  type AccessPlatform,
  type AssignmentPermissionsView,
  type PermissionChoice,
  type SpaceMember,
} from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { samePermissions } from "@/lib/permission-builder"
import { organizationsApi, spaceMembersApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { roleQueryKey } from "./work-roles"

// The builder only renders once somebody opens a person — not on the members page's first paint.
const PermissionBuilder = dynamic(
  () => import("@/components/permissions/permission-builder").then((m) => m.PermissionBuilder),
  { loading: () => <Skeleton className="h-64 w-full" /> },
)

/**
 * "What they can do here" — one person, one workspace, in the member panel.
 *
 * Loads the builder's view (`GET …/permissions`), edits a local copy, and saves
 * the keys (`PUT …/permissions { permissions }`) or a shared role
 * (`{ roleId }`). Every rule on what may be given is the server's; a refusal
 * comes back coded and is said in the reader's language.
 *
 * For an external member this IS their authority — it replaces the plain role
 * picker. For somebody on the staff it sits behind "Customise", next to the
 * roles they already hold.
 *
 * Where they sign in is the member's Access Profile, an organization-level
 * setting: editable here only for whoever manages the organization's members
 * (the PATCH asks `canManageUsers`), shown read-only otherwise.
 */
export function MemberPermissions({
  spaceId,
  member,
  section,
  heading,
  collapsible,
}: {
  spaceId: string
  member: SpaceMember
  section: string
  heading: string
  /** Staff: hidden behind "Customise". External: always open. */
  collapsible: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(!collapsible)
  const { enabledModules, isResolved } = useSpaceModules(spaceId)

  const queryKey = keys.spaceMembers.permissions(spaceId, member.id)
  const viewQ = useQuery({
    queryKey,
    queryFn: () => spaceMembersApi.getPermissions(spaceId, member.id),
    enabled: open,
  })
  const view = viewQ.data
  const [draft, setDraft] = useState<PermissionChoice | null>(null)
  // A new read (after a save, or another person) starts the draft again from what is true.
  useEffect(() => { setDraft(view?.choice ?? null) }, [view])

  const dirty = !!view && !!draft && !samePermissions(permissionsFromChoice(draft), view.permissions)

  const afterSave = (next: AssignmentPermissionsView) => {
    qc.setQueryData(queryKey, next)
    qc.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
    qc.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
    notify.success(t("permissionBuilder.panel.saved"))
  }
  const save = useMutation({
    mutationFn: (body: Parameters<typeof spaceMembersApi.setPermissions>[2]) => spaceMembersApi.setPermissions(spaceId, member.id, body),
    onSuccess: afterSave,
    onError: (e: unknown) => notify.error(serverErrorMessage(e, t)),
  })

  // Where they sign in: org-wide member management only, exactly as the PATCH asks.
  const mayEditPlatform = !!user && (isAdmin(user) || user.canManageUsers === true)
  const platform = useMutation({
    mutationFn: async (next: AccessPlatform) => {
      // The Access Profile is written whole — read it first so modules and scope stay as they are.
      const current = await organizationsApi.getMember(member.userId)
      if (!current) throw new Error(t("permissionBuilder.panel.loadFailed"))
      const persisted = serializeAccessDraft({ ...readAccessDraft(current as never), platforms: next })
      await organizationsApi.updateMember(member.userId, { enabledModules: { ...persisted.enabledModules } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: keys.members.detail(member.userId) })
      notify.success(t("permissionBuilder.panel.platformSaved"))
    },
    onError: (e: unknown) => notify.error(serverErrorMessage(e, t)),
  })

  const name = member.user?.firstName || (member.user ? personName(member.user) : "")
  const sharedRoles = useMemo(() => view?.assignableRoles ?? [], [view])

  return (
    <section className={section}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={heading}>{t("permissionBuilder.panel.title")}</h3>
        {collapsible && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {open ? t("permissionBuilder.panel.hide") : t("permissionBuilder.panel.customise")}
          </Button>
        )}
      </div>

      {open && (
        viewQ.isLoading || (view && !draft) ? (
          <Skeleton className="h-64 w-full" />
        ) : viewQ.isError || !view || !draft ? (
          <p className="text-xs text-muted-foreground">{t("permissionBuilder.panel.loadFailed")}</p>
        ) : (
          <div className="space-y-4">
            {view.roleName && (
              <Badge variant="outline" className="font-normal">
                {view.personal ? t("permissionBuilder.panel.personal") : t("permissionBuilder.panel.role", { role: view.roleName })}
              </Badge>
            )}
            <PermissionBuilder
              name={name}
              isExternal={view.isExternal}
              value={draft}
              onChange={setDraft}
              spaceModules={isResolved ? enabledModules : undefined}
              platform={{
                value: view.platforms,
                onChange: mayEditPlatform ? (p) => platform.mutate(p) : undefined,
                pending: platform.isPending,
              }}
              disabled={save.isPending}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && (
                <Button variant="ghost" size="sm" onClick={() => setDraft(view.choice)} disabled={save.isPending}>
                  {t("permissionBuilder.panel.discard")}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate({ permissions: permissionsFromChoice(draft) })}
                className="gap-1.5"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("permissionBuilder.panel.save")}
              </Button>
            </div>
            {sharedRoles.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-sm text-muted-foreground">{t("permissionBuilder.panel.useRole")}</span>
                <Select
                  value={!view.personal && view.roleId ? view.roleId : undefined}
                  onValueChange={(roleId) => save.mutate({ roleId })}
                  disabled={save.isPending}
                >
                  <SelectTrigger className="h-8 w-48"><SelectValue placeholder={t("permissionBuilder.panel.useRolePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {sharedRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )
      )}
    </section>
  )
}
