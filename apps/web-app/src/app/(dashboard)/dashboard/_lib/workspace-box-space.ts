import i18n from "@/i18n"
import { isTaskOverdue, canManageSpace, canManageMembersInSpace } from "@hbcfield/shared/client"
import type { PersonNodeProps, WorkspaceBoxProps } from "@/components/dashboard"

import { getEmployeeStatus } from "./presence"
import type { PeopleRules } from "./workspace-box-people"
import type { BuildWorkspaceBoxesInput } from "./workspace-boxes-types"

/**
 * The cards being built and the people already placed on one — what the
 * builder's `boxes` / `accountedWorkerIds` locals held. Each step adds to it;
 * a person placed by an earlier step is skipped by the later ones.
 */
export interface BoxAccumulator {
  boxes: WorkspaceBoxProps[]
  accountedWorkerIds: Set<string>
}

/** One space's card: its members in the five groups, its alert count, its buttons. */
export function addSpaceBox(
  acc: BoxAccumulator,
  input: BuildWorkspaceBoxesInput,
  rules: PeopleRules,
  loc: BuildWorkspaceBoxesInput["locations"][number],
) {
  const {
    tasks,
    memberMap,
    assignmentsPerLocation,
    clockedInUserIds,
    onBreakUserIds,
    attendanceByUser,
    activeTaskMap,
    rosterActiveTaskMap,
    activeSpaceByUser,
    spaceNameById,
    shiftLabelInfo,
    currentUser,
    handlers,
  } = input
  const { personNode, memberOnline } = rules
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

    acc.accountedWorkerIds.add(userId)

    // Own tasks come from the tasks query; colleague tasks come from the
    // server-computed roster (employees can't read others' tasks directly).
    const ownTask = activeTaskMap.get(userId)
    const rosterTask = rosterActiveTaskMap.get(userId)
    const activeTaskTitle = ownTask?.title ?? rosterTask?.title
    const isCurrentlyClockedIn = clockedInUserIds.has(userId)
    // On Shift / In Field / Working is decided by WHERE they clocked in
    // (space geofence) + whether the space is shift-based — not their access.
    const { isShiftBased, atSpace } = shiftLabelInfo(userId)
    const facts = attendanceByUser.get(userId)
    const workPresence = facts?.workPresence ?? null
    /*
      The server's evidence-based group wins. The old reading — from where they
      clocked in — only stands for entries that have no group.
    */
    const isRemoteHere = workPresence ? workPresence === "REMOTE" : (facts?.isRemote ?? false)
    const onRoad = workPresence
      ? isCurrentlyClockedIn && workPresence === "FIELD"
      : isCurrentlyClockedIn && !isRemoteHere && isShiftBased && !atSpace

    const isOnBreak = onBreakUserIds.has(userId)

    const { status, tag } = getEmployeeStatus({
      isClockedIn: isCurrentlyClockedIn,
      isOnBreak,
      isOnline: memberOnline(member),
      presence: member.presence,
      isRemote: isRemoteHere,
      needsReview: facts?.needsReview ?? false,
      isShiftBased,
      atSpace,
      workPresence,
      freshness: facts?.freshness,
      lastSeenAt: facts?.lastSeenAt,
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
    } else if (isRemoteHere) {
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

  acc.boxes.push({
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
    /*
      Asked per SPACE, and with the permission each button actually needs.

      These were gated on `isAdminOrDispatcher`, which is "can view all
      tasks" — the wrong question twice over. Managing a workspace needs
      `canManageWorkspaces` and adding a member needs `canManageUsers`, and
      somebody holding neither was offered both: the endpoints refused, so
      the buttons only ever led to a wall.

      Per space because a Space Manager may manage the one they run and no
      other, and this dashboard shows several side by side.
    */
    onEdit: canManageSpace(currentUser, locId) ? handlers.onEdit : undefined,
    onAssign: canManageMembersInSpace(currentUser, locId) ? handlers.onAssign : undefined,
    onViewTasks: handlers.onViewTasks,
    onPersonClick: handlers.onPersonClick,
  })
}
