import i18n from "@/i18n"
import { isTaskOverdue } from "@hbcfield/shared/client"
import type { OrgMember, Task } from "@/lib/api"
import type { PersonNodeProps, WorkspaceBoxProps } from "@/components/dashboard"

import { getAvatarColor, getInitials } from "../_components/helpers"

import { getEmployeeStatus, isOnline, memberToPersonNode } from "./presence"

/**
 * Build the dashboard's space cards.
 *
 * This is the dashboard's real logic: which member belongs to which card, in
 * which of the five groups (present / in field / off-site / off-shift / off
 * duty), plus the catch-all cards for people no space accounts for. It ran as a
 * 250-line closure inside the page component, where it could not be read in
 * isolation or tested at all.
 *
 * Pure: everything it needs arrives as arguments, so the same inputs always
 * produce the same cards. Handlers are passed through rather than captured.
 */
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
  return m.role === "EMPLOYEE"
    ? i18n.t("dashboard.presence.roleMember")
    : i18n.t("dashboard.presence.roleAdmin")
}

/**
 * Give every node in a card the same shape once any one of them carries a
 * subtitle, so a single disambiguated person cannot rag the grid row they sit
 * in. Applied once, at the end, rather than at each of the five push sites.
 */
function reserveSubtitleRows(box: WorkspaceBoxProps): WorkspaceBoxProps {
  const groups = ["people", "offDutyPeople", "offShiftPeople", "onRoadPeople", "remotePeople"] as const
  const needs = groups.some(g => (box[g] as PersonNodeProps[] | undefined)?.some(p => p.subtitle))
  if (!needs) return box
  const out: WorkspaceBoxProps = { ...box }
  for (const g of groups) {
    const list = box[g] as PersonNodeProps[] | undefined
    if (list?.length) (out[g] as PersonNodeProps[]) = list.map(p => ({ ...p, reserveSubtitle: true }))
  }
  return out
}

export interface AttendanceFacts {
  locationId: string
  isRemote: boolean
  withinGeofence: boolean
  /** Open session the reminder engine escalated and stopped chasing. */
  needsReview: boolean
}

export interface BuildWorkspaceBoxesInput {
  /** Spaces the viewer may see, already scoped. */
  locations: Array<{ id: string; name: string; isActive: boolean }>
  tasks: Task[]
  /** Org directory; empty for viewers who may not read it. */
  members: OrgMember[]
  /** id → member, merged from the directory and the space rosters. */
  memberMap: Map<string, OrgMember>
  /** locationId → assigned user ids. */
  assignmentsPerLocation: Map<string, Set<string>>
  clockedInUserIds: Set<string>
  onBreakUserIds: Set<string>
  attendanceByUser: Map<string, AttendanceFacts>
  activeTaskMap: Map<string, Task>
  rosterActiveTaskMap: Map<string, { title: string; status: string }>
  /** The one space a clocked-in member counts as active in. */
  activeSpaceByUser: Map<string, string>
  spaceNameById: Map<string, string>
  /** Is this space shift-based, and is the member confirmed inside its geofence? */
  shiftLabelInfo: (userId: string) => { isShiftBased: boolean; atSpace: boolean }
  isAdminOrDispatcher: boolean
  /** Viewer — always treated as online, since they are looking at the page. */
  currentUserId?: string
  handlers: {
    onEdit?: (locationId: string) => void
    onAssign?: (locationId: string) => void
    onViewTasks: (locationId: string) => void
    onPersonClick: (userId: string) => void
  }
}

export function buildWorkspaceBoxes(input: BuildWorkspaceBoxesInput): WorkspaceBoxProps[] {
  const {
    locations, tasks, members, memberMap, assignmentsPerLocation,
    clockedInUserIds, onBreakUserIds, attendanceByUser, activeTaskMap, rosterActiveTaskMap,
    activeSpaceByUser, spaceNameById, shiftLabelInfo, isAdminOrDispatcher,
    handlers,
  } = input
  const { onEdit: handleEditLocation, onAssign: handleAssignWorkers, onViewTasks: handleViewTasks, onPersonClick: handleNavigateToProfile } = handlers
  // The body below reads the viewer through `user`, exactly as it did inside the
  // component; keeping that shape made the extraction a move rather than a rewrite.
  const user = { id: input.currentUserId }

    const boxes: WorkspaceBoxProps[] = []

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

    /** memberToPersonNode, plus a subtitle for the members who need one. */
    const personNode = (
      member: OrgMember,
      status: Parameters<typeof memberToPersonNode>[1],
      tag?: PersonNodeProps["tag"],
      currentTask?: string,
      clockedIn = false,
    ): PersonNodeProps =>
      memberToPersonNode(
        member,
        status,
        tag,
        currentTask,
        clockedIn,
        subtitleFor(member, ambiguousNames.has(displayName(member))),
      )

    // The viewer is, by definition, online right now (they're looking at this
    // page) — never let their own lastActiveAt lag drop them into "Off Duty".
    const currentUserId = user?.id
    const memberOnline = (m: { id: string; lastActiveAt?: string | null }) =>
      m.id === currentUserId || isOnline(m.lastActiveAt)

    // Track which worker IDs are accounted for (placed in a location box)
    const accountedWorkerIds = new Set<string>()

    // Compute alerts per location

    for (const loc of locations) {
      if (!loc.isActive) continue

      const locId = loc.id
      const assignedUserIds = assignmentsPerLocation.get(locId) || new Set<string>()

      const people: PersonNodeProps[] = []
      const offDutyPeople: PersonNodeProps[] = []
      const offShiftPeople: PersonNodeProps[] = []
      const onRoadPeople: PersonNodeProps[] = []
      const remotePeople: PersonNodeProps[] = []

      for (const userId of assignedUserIds) {
        const member = memberMap.get(userId)
        if (!member) continue
        if (!member.isActive) continue

        accountedWorkerIds.add(userId)

        // Own tasks come from the tasks query; colleague tasks come from the
        // server-computed roster (employees can't read others' tasks directly).
        const ownTask = activeTaskMap.get(userId)
        const rosterTask = rosterActiveTaskMap.get(userId)
        const activeTaskTitle = ownTask?.title ?? rosterTask?.title
        const isCurrentlyClockedIn = clockedInUserIds.has(userId)
        // On Shift / In Field / Working is decided by WHERE they clocked in
        // (space geofence) + whether the space is shift-based — not their access.
        const { isShiftBased, atSpace } = shiftLabelInfo(userId)
        const isRemoteHere = attendanceByUser.get(userId)?.isRemote ?? false
        // "In Field" = clocked in on a shift-based space but not confirmed inside it.
        const onRoad = isCurrentlyClockedIn && !isRemoteHere && isShiftBased && !atSpace

        const isOnBreak = onBreakUserIds.has(userId)

        const { status, tag } = getEmployeeStatus({
          isClockedIn: isCurrentlyClockedIn,
          isOnBreak,
          isOnline: memberOnline(member),
          presence: member.presence,
          isRemote: isRemoteHere,
          needsReview: attendanceByUser.get(userId)?.needsReview ?? false,
          isShiftBased,
          atSpace,
        })

        const node = personNode(member, status, tag, activeTaskTitle, isCurrentlyClockedIn)

        // A member is ACTIVE in exactly one space (activeSpaceByUser). Here they
        // are Present/In-Field/Remote only if this IS that space; in every other
        // space they belong to they read as off-shift ("At {space}" / "Remote") —
        // never a misleading "off-site" active entry, and never double-counted.
        const activeSpace = activeSpaceByUser.get(userId)
        if (!isCurrentlyClockedIn) {
          // Everyone sees WHO is off (online + not-clocked-in → "Off-shift";
          // offline → "Off Duty"). The absence REASON is gated separately (admins
          // & managers only) inside the card.
          if (memberOnline(member)) {
            offShiftPeople.push(personNode(member, status, tag))
          } else {
            offDutyPeople.push(personNode(member, status, tag))
          }
        } else if (activeSpace !== locId) {
          // Clocked in, but their active space is ELSEWHERE → off-shift here, with
          // a hint of where they actually are (not an active "off-site" node).
          const remoteHere = attendanceByUser.get(userId)?.isRemote ?? false
          const whereName = activeSpace ? spaceNameById.get(activeSpace) : null
          const hint = remoteHere
            ? i18n.t("dashboard.presence.remote", "Remote")
            : whereName
              ? i18n.t("dashboard.presence.atSpace", "At {{space}}", { space: whereName })
              : undefined
          offShiftPeople.push(personNode(member, "off", hint ? { text: hint, variant: "hrs" } : undefined))
        } else if (onRoad) {
          // Clocked in here, working on the road → "In Field" group.
          onRoadPeople.push(node)
        } else if (attendanceByUser.get(userId)?.isRemote) {
          // Clocked in remotely (WFH), attributed to this (home) space → "Off-site".
          remotePeople.push(node)
        } else {
          // Clocked in here on-site → Present.
          people.push(node)
        }
      }

      // Count alerts (BLOCKED + overdue tasks at this location)
      let locAlerts = 0
      for (const task of tasks) {
        const isThisLocation = task.spaceId === locId || task.locationAddress?.includes(loc.name)
        if (!isThisLocation) continue
        const isBlocked = task.status === "BLOCKED"
        if (isBlocked || isTaskOverdue(task)) locAlerts++
      }

      const activeCount = people.length + onRoadPeople.length + remotePeople.length

      boxes.push({
        title: loc.name,
        type: "fixed",
        people,
        offDutyPeople,
        offShiftPeople,
        onRoadPeople,
        remotePeople,
        totalAssigned: assignedUserIds.size,
        activeCount,
        locationId: locId,
        alerts: locAlerts,
        // Manage/assign are admin-only; employees get a read-only space view.
        onEdit: isAdminOrDispatcher ? handleEditLocation : undefined,
        onAssign: isAdminOrDispatcher ? handleAssignWorkers : undefined,
        onViewTasks: handleViewTasks,
        onPersonClick: handleNavigateToProfile,
      })
    }

    // "On Task" dynamic box — workers with active tasks NOT assigned to any location
    const onTaskPeople: PersonNodeProps[] = []
    for (const [userId, task] of activeTaskMap) {
      if (accountedWorkerIds.has(userId)) continue
      const member = memberMap.get(userId)
      if (!member) {
        // Fallback to task.assignedTo data if member not found
        if (task.assignedTo) {
          const fallbackStatus = getEmployeeStatus({
            isClockedIn: clockedInUserIds.has(task.assignedTo.id),
            isOnBreak: onBreakUserIds.has(task.assignedTo.id),
            isOnline: false, // no last-active data on the task fallback
            isRemote: attendanceByUser.get(task.assignedTo.id)?.isRemote ?? false,
            needsReview: attendanceByUser.get(task.assignedTo.id)?.needsReview ?? false,
          })
          onTaskPeople.push({
            initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
            color: getAvatarColor(task.assignedTo.id),
            status: fallbackStatus.status,
            imageUrl: task.assignedTo.avatarUrl || undefined,
            name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
            tag: fallbackStatus.tag,
            userId: task.assignedTo.id,
            role: "Employee",
            currentTask: task.title,
          })
        }
        continue
      }
      accountedWorkerIds.add(userId)
      const isClockedIn = clockedInUserIds.has(userId)
      const siTask = shiftLabelInfo(userId)
      const { status, tag } = getEmployeeStatus({
        isClockedIn,
        isOnBreak: onBreakUserIds.has(userId),
        isOnline: memberOnline(member),
        presence: member.presence,
        isRemote: attendanceByUser.get(userId)?.isRemote ?? false,
        needsReview: attendanceByUser.get(userId)?.needsReview ?? false,
        isShiftBased: siTask.isShiftBased,
        atSpace: siTask.atSpace,
      })
      onTaskPeople.push(personNode(member, status, tag, task.title, isClockedIn))
    }

    if (onTaskPeople.length > 0) {
      boxes.push({
        title: i18n.t("dashboard.presence.onTask"),
        type: "dynamic",
        people: onTaskPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }

    // Workers not already placed in a space/task box:
    //  • clocked in  → "On the Clock" catch-all, so a clocked-in driver/worker is
    //    NEVER invisible even with no space assignment and no active task (their
    //    clock-in is server state — independent of whether the app is in use).
    //  • off the clock → "Off-shift" (online/reachable) vs "Off Duty" (offline).
    const offDutyPeople: PersonNodeProps[] = []
    const offShiftPeople: PersonNodeProps[] = []
    const onClockPeople: PersonNodeProps[] = []
    // Employees are always part of presence; admins/owners appear only when
    // they're actually on the clock (a working owner) — never as idle off-duty
    // clutter. A non-employee therefore only reaches the "On the Clock" branch.
    const workers = members.filter(m => m.isActive && (m.role === "EMPLOYEE" || clockedInUserIds.has(m.id)))
    for (const worker of workers) {
      if (accountedWorkerIds.has(worker.id)) continue
      const isClockedIn = clockedInUserIds.has(worker.id)
      const online = memberOnline(worker)

      if (isClockedIn) {
        accountedWorkerIds.add(worker.id)
        const siWorker = shiftLabelInfo(worker.id)
        const { status, tag } = getEmployeeStatus({
          isClockedIn: true,
          isOnBreak: onBreakUserIds.has(worker.id),
          isOnline: online,
          presence: worker.presence,
          isRemote: attendanceByUser.get(worker.id)?.isRemote ?? false,
          needsReview: attendanceByUser.get(worker.id)?.needsReview ?? false,
          isShiftBased: siWorker.isShiftBased,
          atSpace: siWorker.atSpace,
        })
        onClockPeople.push(personNode(worker, status, tag, undefined, true))
      } else if (!activeTaskMap.has(worker.id)) {
        accountedWorkerIds.add(worker.id)
        const { status, tag } = getEmployeeStatus({
          isClockedIn: false,
          isOnBreak: false,
          isOnline: online,
          presence: worker.presence,
        })
        ;(online ? offShiftPeople : offDutyPeople).push(personNode(worker, status, tag))
      }
    }

    if (onClockPeople.length > 0) {
      boxes.push({
        title: i18n.t("dashboard.presence.onTheClock"),
        type: "dynamic",
        people: onClockPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }
    if (offShiftPeople.length > 0) {
      boxes.push({
        title: i18n.t("dashboard.presence.offShift"),
        type: "dynamic",
        people: offShiftPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }
    if (offDutyPeople.length > 0) {
      boxes.push({
        title: i18n.t("dashboard.presence.offDuty"),
        type: "dynamic",
        people: offDutyPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }

    return boxes.map(reserveSubtitleRows)

}
