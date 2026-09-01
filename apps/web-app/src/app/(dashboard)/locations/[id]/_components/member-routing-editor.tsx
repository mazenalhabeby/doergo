"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, MessageCircle, PenLine, Save, Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceMembersApi } from "@/lib/api"
import { type SpaceMember } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { RoleField } from "./role-field"

/**
 * Per-member, per-space routing override (Phase 4d): choose which PEOPLE in this
 * space are notified about this member / whom this member may contact. Each
 * person shows their space role for context. Empty = the space default. Roles
 * (self-maintaining) are configured on the space-level default section.
 */
/**
 * Per-member, per-space routing: who is told about this member, whom they may
 * reach, and who signs off for them.
 *
 * All three name ROLES rather than people. The space-level defaults beside this
 * panel always did; per-member overrides naming individuals meant one screen
 * spoke two vocabularies, and the half that named people went stale the day
 * somebody left — routing at an account that no longer works here, which looks
 * exactly like a message nobody has got to yet.
 *
 * It is also the only version that scales: a list of members grows forever, a
 * space's roles are a handful and stay one.
 */
export function MemberRoutingEditor({
  spaceId,
  member,
}: {
  spaceId: string
  member: SpaceMember
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const name = member.user ? `${member.user.firstName}` : t("scheduling.members.unknownMember")

  const [notifyRoles, setNotifyRoles] = useState<string[]>(member.notifyRoleIds || [])
  const [contactRoles, setContactRoles] = useState<string[]>(member.contactRoleIds || [])
  const [approveRoles, setApproveRoles] = useState<string[]>(member.approveRoleIds || [])

  const mutation = useMutation({
    mutationFn: () =>
      spaceMembersApi.updateRouting(spaceId, member.id, {
        /*
          Roles, not names, on all three.

          The space-level defaults beside this panel have always been role
          based; per-member overrides naming individuals meant one screen spoke
          two vocabularies, and the half that named people went stale the day
          somebody left — routing quietly at an account that no longer works
          here. The user lists are cleared rather than left behind, so a stale
          name cannot outlive the switch.
        */
        notifyRoleIds: notifyRoles,
        notifyUserIds: [],
        contactRoleIds: contactRoles,
        contactUserIds: [],
        // The role IS the answer now; a named person would go stale the day
        // they left, and the routing would keep pointing at a dead account.
        approveRoleIds: approveRoles,
        approveUserIds: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("scheduling.routing.saved", "Routing updated"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const norm = (a: string[]) => JSON.stringify([...a].sort())
  const dirty =
    norm(notifyRoles) !== norm(member.notifyRoleIds || []) ||
    norm(contactRoles) !== norm(member.contactRoleIds || []) ||
    norm(approveRoles) !== norm(member.approveRoleIds || [])

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RoleField
          spaceId={spaceId}
          icon={Bell}
          title={t("scheduling.routing.memberNotify", "Notified about {{name}}", { name })}
          value={notifyRoles}
          onChange={setNotifyRoles}
          emptyHint={t("scheduling.routing.notifyEmpty", "Default: the space's leaders")}
        />
        <RoleField
          spaceId={spaceId}
          icon={MessageCircle}
          title={t("scheduling.routing.memberContact", "{{name}} can contact", { name })}
          value={contactRoles}
          onChange={setContactRoles}
          emptyHint={t("scheduling.routing.contactEmpty", "Default: the space's leaders")}
        />
        {/*
          Sign-off names a ROLE, not a person.

          A name goes stale: whoever leads this site today leaves in March, and
          every member pointed at them keeps routing at an account that no
          longer works here — a document parked on a departed colleague looks
          exactly like one nobody has got to yet. The role stays; who holds it
          changes underneath, and the routing follows without anyone remembering
          to edit it.

          It is also the only version of this that scales. A list of members
          grows forever; the roles in a space are a handful and stay one.

          No space default here, unlike the two beside it — leading a space is
          not authority to countersign somebody's hours, so empty means nobody.
        */}
        <RoleField
          spaceId={spaceId}
          mode="single"
          showHolderCount
          icon={PenLine}
          title={t("scheduling.routing.memberApprove", "Signs off for {{name}}", { name })}
          value={approveRoles}
          onChange={setApproveRoles}
          emptyHint={t(
            "scheduling.routing.approveEmpty",
            "Nobody — documents needing a responsible cannot be issued",
          )}
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  )
}
