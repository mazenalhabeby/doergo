"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, MessageCircle, Save, Loader2, Shield } from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceMembersApi } from "@/lib/api"
import type { SpaceMember } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/** Minimal role shape (works for both SpaceRole and AccessRole). */
type RoleLite = { id: string; name: string; color?: string | null }
type Ids = { roleIds: string[]; userIds: string[] }

/**
 * Per-member, per-space routing override (Phase 4d): choose who is notified about
 * THIS member and who this member may contact, WITHIN this space. Roles + specific
 * people. Empty = the space default. Self-contained: saves on its own.
 */
export function MemberRoutingEditor({
  spaceId,
  member,
  roles,
  roster,
}: {
  spaceId: string
  member: SpaceMember
  roles: RoleLite[]
  roster: SpaceMember[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const name = member.user ? `${member.user.firstName}` : t("scheduling.members.unknownMember")

  const [notifyState, setNotify] = useState<Ids>({
    roleIds: member.notifyRoleIds || [],
    userIds: member.notifyUserIds || [],
  })
  const [contactState, setContact] = useState<Ids>({
    roleIds: member.contactRoleIds || [],
    userIds: member.contactUserIds || [],
  })

  // People to pick from = the other members of this space.
  const people = roster.filter((m) => m.userId !== member.userId && m.user)

  const mutation = useMutation({
    mutationFn: () =>
      spaceMembersApi.updateRouting(spaceId, member.id, {
        notifyRoleIds: notifyState.roleIds,
        notifyUserIds: notifyState.userIds,
        contactRoleIds: contactState.roleIds,
        contactUserIds: contactState.userIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("scheduling.routing.saved", "Routing updated"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const norm = (a: string[]) => JSON.stringify([...a].sort())
  const dirty =
    norm(notifyState.roleIds) !== norm(member.notifyRoleIds || []) ||
    norm(notifyState.userIds) !== norm(member.notifyUserIds || []) ||
    norm(contactState.roleIds) !== norm(member.contactRoleIds || []) ||
    norm(contactState.userIds) !== norm(member.contactUserIds || [])

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Picker
          icon={Bell}
          title={t("scheduling.routing.memberNotify", "Notified about {{name}}", { name })}
          roles={roles}
          people={people}
          value={notifyState}
          onChange={setNotify}
          emptyHint={t("scheduling.routing.notifyEmpty", "Default: the space's leaders")}
        />
        <Picker
          icon={MessageCircle}
          title={t("scheduling.routing.memberContact", "{{name}} can contact", { name })}
          roles={roles}
          people={people}
          value={contactState}
          onChange={setContact}
          emptyHint={t("scheduling.routing.contactEmpty", "Default: the space's leaders")}
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

function Picker({
  icon: Icon,
  title,
  roles,
  people,
  value,
  onChange,
  emptyHint,
}: {
  icon: typeof Bell
  title: string
  roles: RoleLite[]
  people: SpaceMember[]
  value: Ids
  onChange: (v: Ids) => void
  emptyHint: string
}) {
  const { t } = useTranslation()
  const toggleRole = (id: string) =>
    onChange({ ...value, roleIds: value.roleIds.includes(id) ? value.roleIds.filter((x) => x !== id) : [...value.roleIds, id] })
  const toggleUser = (id: string) =>
    onChange({ ...value, userIds: value.userIds.includes(id) ? value.userIds.filter((x) => x !== id) : [...value.userIds, id] })
  const empty = value.roleIds.length === 0 && value.userIds.length === 0

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-foreground truncate">{title}</p>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("scheduling.routing.roles", "Roles")}</p>
        {roles.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent/40">
            <Checkbox checked={value.roleIds.includes(r.id)} onCheckedChange={() => toggleRole(r.id)} />
            <span className="h-5 w-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${r.color || "#6b7280"}20` }}>
              <Shield className="h-2.5 w-2.5" style={{ color: r.color || "#6b7280" }} />
            </span>
            <span className="text-sm text-foreground">{r.name}</span>
          </label>
        ))}
        {people.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("scheduling.routing.people", "Specific people")}</p>
            {people.map((m) => (
              <label key={m.userId} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent/40">
                <Checkbox checked={value.userIds.includes(m.userId)} onCheckedChange={() => toggleUser(m.userId)} />
                <Avatar className="h-5 w-5">
                  {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[9px]">{(m.user?.firstName?.[0] || "") + (m.user?.lastName?.[0] || "")}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-foreground truncate">{m.user?.firstName} {m.user?.lastName}</span>
              </label>
            ))}
          </>
        )}
      </div>
      {empty && <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{emptyHint}</p>}
    </div>
  )
}
