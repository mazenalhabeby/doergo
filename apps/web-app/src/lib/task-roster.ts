/**
 * Who is on a task, lead first.
 *
 * Tasks carry assignments two ways: the modern `assignees[]` rows with a
 * LEAD/MEMBER role, and the legacy single `assignedTo` from before multi-assign
 * existed. Screens that need "everyone on this task" had to know about both,
 * which is how the Message button ended up offering one person while the card
 * beside it showed three.
 */

export interface RosterAssignee {
  role: "LEAD" | "MEMBER"
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null }
}

export interface RosterFallback {
  id?: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}

export interface RosterPerson {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
  isLead: boolean
}

/**
 * Lead first, then the rest in their given order. Duplicates are dropped — the
 * same person can appear as both the legacy assignee and an assignee row.
 * Returns [] when nobody is assigned.
 */
export function taskRoster(
  assignees: RosterAssignee[] | undefined | null,
  assignedTo?: RosterFallback | null,
): RosterPerson[] {
  const rows = assignees ?? []

  if (rows.length === 0) {
    // Legacy task: the single assignee is, by definition, the lead.
    return assignedTo?.id
      ? [{
          id: assignedTo.id,
          firstName: assignedTo.firstName,
          lastName: assignedTo.lastName,
          avatarUrl: assignedTo.avatarUrl,
          isLead: true,
        }]
      : []
  }

  const lead = rows.find(a => a.role === "LEAD")
  const ordered = lead ? [lead, ...rows.filter(a => a !== lead)] : rows

  const seen = new Set<string>()
  return ordered.reduce<RosterPerson[]>((out, a) => {
    if (seen.has(a.user.id)) return out
    seen.add(a.user.id)
    out.push({
      id: a.user.id,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      avatarUrl: a.user.avatarUrl,
      isLead: a.role === "LEAD",
    })
    return out
  }, [])
}
