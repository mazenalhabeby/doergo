"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import {
  jobTitleOf,
  mayGrantSpaceRoles,
  mayManageSpaceMembers,
  personInitials,
  personName,
  type SpaceMember,
  type SpaceRoleInSpace,
} from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { type LocationAssignment, spaceMembersApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { MemberRoutingEditor } from "./member-routing-editor"
import { MemberAutoClock } from "./member-auto-clock"
import { MemberPermissions } from "./member-permissions"
import { MemberRolesSection } from "./member-roles-section"
import { MemberBillingSection } from "./member-billing-section"
import { MemberRatesSection } from "./member-rates-section"
import { roleQueryKey, type BillBy } from "./work-roles"

/** Everything about one person in this workspace — what the row only shows. */
export function MemberPanel({
  spaceId,
  member,
  roles,
  roster,
  isClient,
  autoClockRow,
  autoClockWorkspace,
  onClose,
}: {
  spaceId: string
  member: SpaceMember | null
  roles: SpaceRoleInSpace[]
  roster: SpaceMember[]
  isClient: boolean
  /**
   * The automatic clock's roster row for this member. `undefined` = not offered
   * (the workspace has it off, or an external member — they hold no clock);
   * `null` = offered, still loading.
   */
  autoClockRow?: LocationAssignment | null
  autoClockWorkspace: { dwellMinutes: number; exitGraceMinutes: number; noShiftMinutes: number }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const external = member?.user?.isExternal === true
  /*
    Giving roles here — the same rule as the server's builder routes
    (`spaceMemberAuthority().grantRoles`): managing this workspace's people, or
    `canGrantSpaceRoles` here or org-wide (workspaces administrators and admins
    included). For an external member the builder REPLACES the role picker:
    their whole authority is what they may do in this one workspace.
  */
  const mayGrant = !!user && (mayManageSpaceMembers(user, spaceId) || mayGrantSpaceRoles(user, spaceId))
  const builderReplacesPicker = external && mayGrant

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
    queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
  }
  const update = useMutation({
    mutationFn: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) =>
      spaceMembersApi.updateRoles(spaceId, member!.id, data),
    onSuccess: () => {
      invalidate()
      notify.success(t("scheduling.workRoles.memberSaved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => spaceMembersApi.remove(spaceId, member!.id),
    onSuccess: () => {
      invalidate()
      notify.success(t("scheduling.members.toast.removed"))
      setConfirmRemove(false)
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const workRole = member?.workRole ? roles.find((r) => r.id === member.workRole!.id) : undefined
  const bill = (member?.effectiveBillBy ?? "HOUR") as BillBy
  const section = "space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
  const heading = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <Sheet
      open={!!member}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {member && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {member.user?.avatarUrl && <AvatarImage src={member.user.avatarUrl} alt="" />}
                  <AvatarFallback>{personInitials(member.user)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate">
                    {member.user ? personName(member.user) : t("scheduling.members.unknownMember")}
                  </span>
                  <SheetDescription className="truncate text-xs">
                    {jobTitleOf({ position: member.user?.position, memberRole: member.spaceRole }) ||
                      t("scheduling.membersPage.inWorkspace")}
                  </SheetDescription>
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              {/* An external member's whole authority is the builder below — no trade, no second role. */}
              {!builderReplacesPicker && (
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

              {isClient && !external && (
                <MemberBillingSection
                  member={member}
                  bill={bill}
                  onUpdate={(data) => update.mutate(data)}
                  saving={update.isPending}
                  section={section}
                  heading={heading}
                />
              )}

              {isClient && !external && (
                <MemberRatesSection
                  spaceId={spaceId}
                  member={member}
                  bill={bill}
                  workRole={workRole}
                  onSaved={invalidate}
                  section={section}
                  heading={heading}
                />
              )}

              {/* Only while the workspace has the automatic clock on, and never for an external member. */}
              {autoClockRow !== undefined && (
                <MemberAutoClock
                  spaceId={spaceId}
                  row={autoClockRow ?? undefined}
                  workspace={autoClockWorkspace}
                  section={section}
                  heading={heading}
                />
              )}

              <section className={section}>
                <h3 className={heading}>{t("scheduling.membersPage.notifications")}</h3>
                <MemberRoutingEditor spaceId={spaceId} member={member} roster={roster} stacked />
              </section>

              <section className={section}>
                <Button
                  variant="ghost"
                  className="gap-1.5 px-0 text-red-600 hover:bg-transparent hover:text-red-700"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("scheduling.membersPage.removeFromWorkspace")}
                </Button>
              </section>
            </div>

            <ConfirmDialog
              open={confirmRemove}
              onOpenChange={setConfirmRemove}
              title={t("scheduling.members.removeTitle", "Remove from workspace?")}
              description={t("scheduling.members.removeConfirm", { name: personName(member.user) })}
              confirmLabel={t("scheduling.members.remove", "Remove")}
              onConfirm={(e) => {
                e.preventDefault()
                remove.mutate()
              }}
              destructive
              pending={remove.isPending}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
