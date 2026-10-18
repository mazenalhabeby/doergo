import i18n from "i18next"
import type { OrgMember } from "@/lib/api"
import type { PersonNodeProps, WorkspaceBoxProps } from "@/components/dashboard"

import { isOnline, memberToPersonNode } from "./presence"

/** "Ada L." — the label the cards actually show. Mirrors memberToPersonNode. */
export function displayName(m: Pick<OrgMember, "firstName" | "lastName">): string {
  return m.lastName?.[0] ? `${m.firstName} ${m.lastName[0]}.` : m.firstName
}

/**
 * What to print under a person's name.
 *
 * Everyone with a position or a specialty shows it — a roster reads far better
 * when it says who does what, and "Electrician" under a name is useful whether
 * or not anyone else shares that name.
 *
 * The fallback to ROLE is the part that stays conditional. "Member" under every
 * name is noise: it repeats what the card already implies and pushes a line
 * into every node to say nothing. It earns its place in exactly one case — when
 * two people display the same name and neither has a title, so without it the
 * dashboard shows the same label twice, in different states, and reads as one
 * person being in two places at once.
 *
 * Deliberately never the email: the most reliably unique field, and the worst
 * one to paint across a shared screen.
 */
export function subtitleFor(m: OrgMember, ambiguous: boolean): string | undefined {
  const own = m.position?.trim() || m.specialty?.trim()
  if (own) return own
  if (!ambiguous) return undefined
  return m.role === "EMPLOYEE" ? i18n.t("dashboard.presence.roleMember") : i18n.t("dashboard.presence.roleAdmin")
}

/**
 * Give every node in a card the same shape once any one of them carries a
 * subtitle, so a single disambiguated person cannot rag the grid row they sit
 * in. Applied once, at the end, rather than at each of the five push sites.
 */
export function reserveSubtitleRows(box: WorkspaceBoxProps): WorkspaceBoxProps {
  const groups = ["people", "offDutyPeople", "offShiftPeople", "onRoadPeople", "remotePeople"] as const
  const needs = groups.some((g) => (box[g] as PersonNodeProps[] | undefined)?.some((p) => p.subtitle))
  if (!needs) return box
  const out: WorkspaceBoxProps = { ...box }
  for (const g of groups) {
    const list = box[g] as PersonNodeProps[] | undefined
    if (list?.length) (out[g] as PersonNodeProps[]) = list.map((p) => ({ ...p, reserveSubtitle: true }))
  }
  return out
}

/** How a member becomes a node on a card, and whether they count as online. */
export interface PeopleRules {
  personNode: (
    member: OrgMember,
    status: Parameters<typeof memberToPersonNode>[1],
    tag?: PersonNodeProps["tag"],
    currentTask?: string,
    clockedIn?: boolean,
  ) => PersonNodeProps
  memberOnline: (m: { id: string; lastActiveAt?: string | null }) => boolean
}

export function peopleRules(members: OrgMember[], currentUserId: string | undefined): PeopleRules {
  /*
    Names that more than one active member answers to.

    Only decides the ROLE fallback — a title is shown to everyone who has one.
    Computed once over the whole directory rather than per card, so a member
    whose name clashes is labelled identically in every card they appear in.
    Deciding per card would label the same person inconsistently depending on
    who else happened to be beside them.
  */
  const ambiguousNames = (() => {
    const seen = new Map<string, number>()
    for (const m of members) {
      if (!m.isActive) continue
      const n = displayName(m)
      seen.set(n, (seen.get(n) ?? 0) + 1)
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name))
  })()

  return {
    /** memberToPersonNode, plus a subtitle for the members who need one. */
    personNode: (member, status, tag, currentTask, clockedIn = false) =>
      memberToPersonNode(
        member,
        status,
        tag,
        currentTask,
        clockedIn,
        subtitleFor(member, ambiguousNames.has(displayName(member))),
      ),
    // The viewer is, by definition, online right now (they're looking at this
    // page) — never let their own lastActiveAt lag drop them into "Off Duty".
    memberOnline: (m) => m.id === currentUserId || isOnline(m.lastActiveAt),
  }
}
