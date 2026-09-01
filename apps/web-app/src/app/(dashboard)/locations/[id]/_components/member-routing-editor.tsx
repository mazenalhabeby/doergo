"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, MessageCircle, PenLine, Save, Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceMembersApi } from "@/lib/api"
import { jobTitleOf, type SpaceMember } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/**
 * Per-member, per-space routing override (Phase 4d): choose which PEOPLE in this
 * space are notified about this member / whom this member may contact. Each
 * person shows their space role for context. Empty = the space default. Roles
 * (self-maintaining) are configured on the space-level default section.
 */
export function MemberRoutingEditor({
  spaceId,
  member,
  roster,
  orgMembers,
}: {
  spaceId: string
  member: SpaceMember
  roster: SpaceMember[]
  /**
   * Everyone in the organisation — the pool the RESPONSIBLE is chosen from.
   *
   * Not the space roster. Whoever signs off for somebody is usually an owner or
   * a manager, and those people are frequently in no space at all: the two
   * accounts that run this business belong to none, so a picker limited to
   * space members could never offer either of them, and the one person it did
   * offer was the wrong one. Sign-off is an organisational relationship, not a
   * seat on a site.
   *
   * The server already agreed: approveUserIds stores a plain user id,
   * resolveMemberRouting adds it without checking membership, and the document
   * chain resolves the candidate by organizationId. Only this list disagreed.
   */
  orgMembers?: {
    id: string
    firstName: string
    lastName: string
    email?: string
    avatarUrl?: string | null
    position?: string | null
    specialty?: string | null
    memberRole?: { id: string; name: string; color?: string | null } | null
  }[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const name = member.user ? `${member.user.firstName}` : t("scheduling.members.unknownMember")

  const [notifyUsers, setNotifyUsers] = useState<string[]>(member.notifyUserIds || [])
  const [contactUsers, setContactUsers] = useState<string[]>(member.contactUserIds || [])
  const [approveUsers, setApproveUsers] = useState<string[]>(member.approveUserIds || [])

  // People to pick from = the other members of this space who HOLD a space role
  // (Space Manager / Shift Leader / …). Routing goes to leaders, not plain members.
  const people = roster.filter((m) => m.userId !== member.userId && m.user && m.spaceRole)

  /*
    Sign-off is picked from EVERYONE in the space, not only role holders.

    The two lists above are about defaults that fall back to "the space's
    leaders", so restricting them to leaders is consistent. This one has no
    default and no fallback — it is an explicit, per-person choice, and the
    server stores the user id directly without asking what role they hold.
    Requiring a space role here would mean a three-person site with no
    hierarchy could not name a responsible at all, and the documents that need
    one could never be issued.
  */
  const approvers: PickablePerson[] = (orgMembers ?? [])
    // Nobody approves their own hours.
    .filter((e) => e.id !== member.userId)
    .map((e) => ({
      id: `org-${e.id}`,
      userId: e.id,
      user: { id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, avatarUrl: e.avatarUrl ?? null },
      // Deliberately no space role: these people are being offered as
      // colleagues in the organisation, and most hold no role in THIS space.
      spaceRole: null,
      subtitle: jobTitleOf(e),
    }))

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
          people={people}
          selected={notifyUsers}
          onToggle={(id) => toggle(notifyUsers, setNotifyUsers, id)}
          emptyHint={t("scheduling.routing.notifyEmpty", "Default: the space's leaders")}
        />
        <PeoplePicker
          icon={MessageCircle}
          title={t("scheduling.routing.memberContact", "{{name}} can contact", { name })}
          people={people}
          selected={contactUsers}
          onToggle={(id) => toggle(contactUsers, setContactUsers, id)}
          emptyHint={t("scheduling.routing.contactEmpty", "Default: the space's leaders")}
        />
        {/*
          Sign-off, and no default.

          The other two fall back to the space's leaders when left empty; this
          one does not, on purpose. Being a space leader is not authority to
          countersign somebody's hours, and a document that quietly routed to
          whoever happened to lead the space would be signed by the wrong person
          with nothing on the page to show it. Empty here means nobody — and the
          issue screen says so rather than skipping the step.
        */}
        <PeoplePicker
          icon={PenLine}
          title={t("scheduling.routing.memberApprove", "Signs off for {{name}}", { name })}
          people={approvers}
          selected={approveUsers}
          onToggle={(id) => toggle(approveUsers, setApproveUsers, id)}
          emptyHint={t("scheduling.routing.approveEmpty", "Nobody — documents needing a responsible cannot be issued")}
          noPeopleHint={t("scheduling.routing.noColleagues", "Nobody else is in this organisation yet.")}
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

/** A person as this list shows them: the member, plus what they do. */
type PickablePerson = SpaceMember & { subtitle?: string | null }

/** How a person reads in this list — the thing that has to be unique. */
const displayName = (m: PickablePerson) =>
  `${m.user?.firstName ?? ""} ${m.user?.lastName ?? ""}`.trim().toLowerCase()

/** Names held by more than one of the people offered. */
function ambiguousNames(people: PickablePerson[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const m of people) {
    const n = displayName(m)
    if (seen.has(n)) dupes.add(n)
    seen.add(n)
  }
  return dupes
}

function PeoplePicker({
  icon: Icon,
  title,
  people,
  selected,
  onToggle,
  emptyHint,
  noPeopleHint,
}: {
  icon: typeof Bell
  title: string
  people: PickablePerson[]
  selected: string[]
  onToggle: (id: string) => void
  emptyHint: string
  // "Nobody has a role here" is wrong for a picker that does not need one.
  noPeopleHint?: string
}) {
  const { t } = useTranslation()
  const ambiguous = ambiguousNames(people)
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-foreground truncate">{title}</p>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {people.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {noPeopleHint ?? t("scheduling.routing.noPeople", "No other members with a role in this workspace.")}
          </p>
        ) : (
          people.map((m) => (
            <label key={m.userId} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent/40">
              <Checkbox checked={selected.includes(m.userId)} onCheckedChange={() => onToggle(m.userId)} />
              <Avatar className="h-6 w-6">
                {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                <AvatarFallback className="text-[9px]">{(m.user?.firstName?.[0] || "") + (m.user?.lastName?.[0] || "")}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {m.user?.firstName} {m.user?.lastName}
                </span>
                {/*
                  What they do, and — only when two people share a name — which
                  account it is.

                  A name alone does not tell you whether this is the right
                  person to countersign somebody's hours. "IT Engineering" and
                  "Sales" do, immediately.

                  The email is held back unless the name is ambiguous: two
                  accounts for one human is ordinary, and this list showed both
                  as an identical row with nothing to choose between — somebody
                  picked one, got the other, and the document went to an account
                  they were not signed into. Beside a name that is already
                  unique the address is noise, and a picker that whispers twice
                  as much stops being read.
                */}
                {(m.subtitle || (ambiguous.has(displayName(m)) && m.user?.email)) && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[m.subtitle, ambiguous.has(displayName(m)) ? m.user?.email : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
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
      {selected.length === 0 && <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{emptyHint}</p>}
    </div>
  )
}
