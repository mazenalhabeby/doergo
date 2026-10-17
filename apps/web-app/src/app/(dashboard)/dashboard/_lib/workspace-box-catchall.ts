import i18n from "@/i18n"
import { personInitials } from "@hbcfield/shared/client"
import type { PersonNodeProps } from "@/components/dashboard"

import { getAvatarColor } from "../_components/helpers"

import { getEmployeeStatus } from "./presence"
import { displayName, type PeopleRules } from "./workspace-box-people"
import type { BoxAccumulator } from "./workspace-box-space"
import type { BuildWorkspaceBoxesInput } from "./workspace-boxes-types"

/** "On Task" dynamic box — workers with active tasks NOT assigned to any location. */
export function addOnTaskBox(
  acc: BoxAccumulator,
  input: BuildWorkspaceBoxesInput,
  rules: PeopleRules,
  viewerIsOrgWide: boolean,
) {
  const { memberMap, clockedInUserIds, onBreakUserIds, attendanceByUser, activeTaskMap, shiftLabelInfo, handlers } =
    input
  const { personNode, memberOnline } = rules
  const onTaskPeople: PersonNodeProps[] = []
  for (const [userId, task] of activeTaskMap) {
    if (acc.accountedWorkerIds.has(userId)) continue
    const member = memberMap.get(userId)
    if (!member) {
      /*
        Not on any roster this viewer can see — so not their person.

        `memberMap` is built from the rosters of the spaces the viewer holds.
        Somebody missing from it is somebody working at a site the viewer
        supervises while being ROSTERED somewhere else: their task is visible,
        they are not. Falling back to `task.assignedTo` put them on the board
        as a body, with a status and a current task, assembled from a person
        the viewer was never given.

        An org-wide viewer keeps the fallback: their roster is everyone, so
        the only person it can add is somebody with no space assignment at
        all, which is exactly the case it was written for.
      */
      if (!viewerIsOrgWide) continue
      if (task.assignedTo) {
        const fallbackStatus = getEmployeeStatus({
          isClockedIn: clockedInUserIds.has(task.assignedTo.id),
          isOnBreak: onBreakUserIds.has(task.assignedTo.id),
          isOnline: false, // no last-active data on the task fallback
          isRemote: attendanceByUser.get(task.assignedTo.id)?.isRemote ?? false,
          needsReview: attendanceByUser.get(task.assignedTo.id)?.needsReview ?? false,
        })
        onTaskPeople.push({
          initials: personInitials(task.assignedTo),
          color: getAvatarColor(task.assignedTo.id),
          status: fallbackStatus.status,
          imageUrl: task.assignedTo.avatarUrl || undefined,
          name: displayName(task.assignedTo),
          tag: fallbackStatus.tag,
          userId: task.assignedTo.id,
          role: "Employee",
          currentTask: task.title,
        })
      }
      continue
    }
    acc.accountedWorkerIds.add(userId)
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
    acc.boxes.push({
      title: i18n.t("dashboard.presence.onTask"),
      type: "dynamic",
      people: onTaskPeople,
      onPersonClick: handlers.onPersonClick,
    })
  }
}

/**
 * Workers not already placed in a space/task box:
 *  • clocked in  → "On the Clock" catch-all, so a clocked-in driver/worker is
 *    NEVER invisible even with no space assignment and no active task (their
 *    clock-in is server state — independent of whether the app is in use).
 *  • off the clock → "Off-shift" (online/reachable) vs "Off Duty" (offline).
 */
export function addLeftoverBoxes(acc: BoxAccumulator, input: BuildWorkspaceBoxesInput, rules: PeopleRules) {
  const { members, clockedInUserIds, onBreakUserIds, attendanceByUser, activeTaskMap, shiftLabelInfo, handlers } = input
  const { personNode, memberOnline } = rules
  const offDutyPeople: PersonNodeProps[] = []
  const offShiftPeople: PersonNodeProps[] = []
  const onClockPeople: PersonNodeProps[] = []
  // Employees are always part of presence; admins/owners appear only when
  // they're actually on the clock (a working owner) — never as idle off-duty
  // clutter. A non-employee therefore only reaches the "On the Clock" branch.
  const workers = members.filter((m) => m.isActive && (m.role === "EMPLOYEE" || clockedInUserIds.has(m.id)))
  for (const worker of workers) {
    if (acc.accountedWorkerIds.has(worker.id)) continue
    const isClockedIn = clockedInUserIds.has(worker.id)
    const online = memberOnline(worker)

    if (isClockedIn) {
      acc.accountedWorkerIds.add(worker.id)
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
      acc.accountedWorkerIds.add(worker.id)
      const { status, tag } = getEmployeeStatus({
        isClockedIn: false,
        isOnBreak: false,
        isOnline: online,
        presence: worker.presence,
      })
      ;(online ? offShiftPeople : offDutyPeople).push(personNode(worker, status, tag))
    }
  }

  const groups: Array<[string, PersonNodeProps[]]> = [
    ["dashboard.presence.onTheClock", onClockPeople],
    ["dashboard.presence.offShift", offShiftPeople],
    ["dashboard.presence.offDuty", offDutyPeople],
  ]
  for (const [titleKey, people] of groups) {
    if (people.length > 0) {
      acc.boxes.push({ title: i18n.t(titleKey), type: "dynamic", people, onPersonClick: handlers.onPersonClick })
    }
  }
}
