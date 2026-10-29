"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  mayGrantSpaceRoles,
  mayManageSpaceMembers,
  type SpaceMember,
  type SpaceRoleInSpace,
} from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { spaceMembersApi, spaceRolesApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { MemberPermissions } from "./member-permissions"
import { MemberRolesSection } from "./member-roles-section"
import { roleQueryKey } from "./work-roles"

/** Saving a member's roles here (trade, management role, second role, how they are billed) — one place for every caller. */
export function useMemberRolesUpdate(spaceId: string, memberId: string | undefined) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) =>
      spaceMembersApi.updateRoles(spaceId, memberId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      qc.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      // The person's own Access table reads their workspaces — it shows the new role too.
      qc.invalidateQueries({ queryKey: keys.memberRecord.assignments() })
      notify.success(t("scheduling.workRoles.memberSaved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })
}

/**
 * What one person may do in one workspace: their roles there and, for whoever may give roles there, the
 * permission builder. THE same pieces in both doors — the workspace's member panel and the person's own Access
 * tab — so the two can never disagree. For an external member the builder REPLACES the role picker: their whole
 * authority is what they may do in this one workspace (the same rule as the server's builder routes).
 */
export function MemberAccessSections({
  spaceId,
  member,
  roles,
  section,
  heading,
}: {
  spaceId: string
  member: SpaceMember
  roles: SpaceRoleInSpace[]
  section: string
  heading: string
}) {
  const { user } = useAuth()
  const update = useMemberRolesUpdate(spaceId, member.id)
  const external = member.user?.isExternal === true
  const mayGrant = !!user && (mayManageSpaceMembers(user, spaceId) || mayGrantSpaceRoles(user, spaceId))
  return (
    <>
      {!(external && mayGrant) && (
        <MemberRolesSection
          spaceId={spaceId}
          member={member}
          roles={roles}
          external={external}
          onUpdate={(data) => update.mutate(data)}
          saving={update.isPending}
          section={section}
          heading={heading}
        />
      )}
      {mayGrant && (
        <MemberPermissions
          key={member.id}
          spaceId={spaceId}
          member={member}
          section={section}
          heading={heading}
          collapsible={!external}
        />
      )}
    </>
  )
}

/**
 * The same sections, opened from the PERSON's side: reads the workspace's roster and roles with the workspace
 * page's own queries (shared cache — opening the workspace afterwards costs nothing), only when a row is opened.
 */
export function MemberAccessInSpace({ spaceId, userId }: { spaceId: string; userId: string }) {
  const { t } = useTranslation()
  const membersQ = useQuery({ queryKey: keys.spaceMembers.list(spaceId), queryFn: () => spaceMembersApi.list(spaceId) })
  const rolesQ = useQuery({ queryKey: roleQueryKey(spaceId), queryFn: () => spaceRolesApi.listInSpace(spaceId) })
  if (membersQ.isLoading || rolesQ.isLoading) return <Skeleton className="h-40 w-full" />
  const member = (membersQ.data ?? []).find((m) => m.userId === userId || m.user?.id === userId)
  if (!member) return <p className="text-sm text-muted-foreground">{t("members.access.notHere")}</p>
  return (
    <div className="space-y-4">
      <MemberAccessSections
        spaceId={spaceId}
        member={member}
        roles={rolesQ.data ?? []}
        section="space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
        heading="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      />
    </div>
  )
}
