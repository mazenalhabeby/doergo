"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, MessageCircle, PenLine, Save, Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceMembersApi } from "@/lib/api"
import { type SpaceMember } from "@hbcfield/shared/client"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

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
/**
 * Per-member, per-space routing: who is told about this member, whom they may
 * reach, and who signs off for them.
 *
 * All three name PEOPLE, chosen from the space's leaders — the members who hold
 * a space role. Naming the ROLE instead was tried and is wrong for the way this
 * is actually used: a space manager might be the contact while a shift leader
 * signs off, and picking "Shift Leader" targets everybody who holds it rather
 * than the one person meant.
 *
 * Sign-off may name several, and any of them can sign — the first to do so
 * completes the step and it leaves the others' lists. That is why it is not a
 * single-select: a shift with two leaders should not stall because one is away.
 */
export function MemberRoutingEditor({
  spaceId,
  member,
  roster,
}: {
  spaceId: string
  member: SpaceMember
  roster: SpaceMember[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const name = member.user ? `${member.user.firstName}` : t("scheduling.members.unknownMember")

  const [notifyUsers, setNotifyUsers] = useState<string[]>(member.notifyUserIds || [])
  const [contactUsers, setContactUsers] = useState<string[]>(member.contactUserIds || [])
  const [approveUsers, setApproveUsers] = useState<string[]>(member.approveUserIds || [])

  /*
    The space's leaders, and not the member themselves.

    Routing goes to people who hold a role here — a plain colleague is not who
    anyone means by "notified about" or "signs off for". A space where nobody
    holds a role offers nobody, and the empty state says so rather than
    pretending the field is optional.
  */
  const leaders = roster.filter((m) => m.userId !== member.userId && m.user && m.spaceRole)

  const mutation = useMutation({
    mutationFn: () =>
      spaceMembersApi.updateRouting(spaceId, member.id, {
        notifyUserIds: notifyUsers,
        notifyRoleIds: [],
        contactUserIds: contactUsers,
        contactRoleIds: [],
        approveUserIds: approveUsers,
        approveRoleIds: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("scheduling.routing.saved", "Routing updated"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const norm = (a: string[]) => JSON.stringify([...a].sort())
  const dirty =
    norm(notifyUsers) !== norm(member.notifyUserIds || []) ||
    norm(contactUsers) !== norm(member.contactUserIds || []) ||
    norm(approveUsers) !== norm(member.approveUserIds || [])

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PeoplePicker
          icon={Bell}
          title={t("scheduling.routing.memberNotify", "Notified about {{name}}", { name })}
          people={leaders}
          selected={notifyUsers}
          onToggle={(id) => toggle(notifyUsers, setNotifyUsers, id)}
          emptyHint={t("scheduling.routing.notifyEmpty", "Default: the space's leaders")}
        />
        <PeoplePicker
          icon={MessageCircle}
          title={t("scheduling.routing.memberContact", "{{name}} can contact", { name })}
          people={leaders}
          selected={contactUsers}
          onToggle={(id) => toggle(contactUsers, setContactUsers, id)}
          emptyHint={t("scheduling.routing.contactEmpty", "Default: the space's leaders")}
        />
        {/*
          Sign-off has NO default, unlike the two beside it.

          Leading a space is not authority to countersign somebody's hours, so
          empty means nobody and documents needing a responsible cannot be
          issued — which the hint says, because discovering it on payroll day is
          the alternative.
        */}
        <PeoplePicker
          icon={PenLine}
          title={t("scheduling.routing.memberApprove", "Signs off for {{name}}", { name })}
          people={leaders}
          selected={approveUsers}
          onToggle={(id) => toggle(approveUsers, setApproveUsers, id)}
          emptyHint={t(
            "scheduling.routing.approveEmpty",
            "Nobody — documents needing a responsible cannot be issued",
          )}
          footHint={
            approveUsers.length > 1
              ? t(
                  "scheduling.routing.approveAny",
                  "Any one of them can sign. Whoever signs first completes it.",
                )
              : undefined
          }
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

function PeoplePicker({
  icon: Icon,
  title,
  people,
  selected,
  onToggle,
  emptyHint,
  footHint,
}: {
  icon: typeof Bell
  title: string
  people: SpaceMember[]
  selected: string[]
  onToggle: (id: string) => void
  emptyHint: string
  /** Said only when it changes what happens — see the sign-off case. */
  footHint?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</p>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {people.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {t("scheduling.routing.noPeople", "No other members with a role in this workspace.")}
          </p>
        ) : (
          people.map((m) => (
            <label key={m.userId} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent/40">
              <Checkbox checked={selected.includes(m.userId)} onCheckedChange={() => onToggle(m.userId)} />
              <Avatar className="h-6 w-6">
                {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                <AvatarFallback className="text-[9px]">
                  {(m.user?.firstName?.[0] || "") + (m.user?.lastName?.[0] || "")}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {m.user?.firstName} {m.user?.lastName}
              </span>
              {m.spaceRole && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px]"
                  style={m.spaceRole.color ? { borderColor: `${m.spaceRole.color}66`, color: m.spaceRole.color } : undefined}
                >
                  {m.spaceRole.name}
                </Badge>
              )}
            </label>
          ))
        )}
      </div>
      <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        {selected.length === 0 ? emptyHint : footHint ?? null}
      </p>
    </div>
  )
}
