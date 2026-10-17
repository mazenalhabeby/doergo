"use client";

import { keys } from "@/lib/query-keys";
import { useMemo, useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { locationsApi } from "@/lib/api";
import { isAssignedTo } from "@/lib/task-assignment";
import { notify } from "@/lib/toast";
import { type WorkspaceBoxProps, type LiveEvent, type PendingAction } from "@/components/dashboard";
import { useTour } from "@/components/tour";
import { getGreeting } from "./helpers";
import { buildRecentActivity, buildPendingActions } from "./dashboard-activity";
import { buildWorkspaceBoxes } from "../_lib/build-workspace-boxes";
import { useDashboardData } from "../_lib/use-dashboard-data";
import { useClientDashboardData } from "./use-client-dashboard-data";

/** ClientDashboard's state and handlers — everything before its markup, moved here unchanged. */
export function useClientDashboard() {
  const {
    user,
    t,
    i18n,
    router,
    activeTourId,
    isTourCompleted,
    isAdminOrDispatcher,
    isDataLoading,
    tasks,
    members,
    todayEntries,
    pendingApprovals,
    memberMap,
    clockedInUserIds,
    attendanceByUser,
    onBreakUserIds,
    shiftLabelInfo,
    activeTaskMap,
    rosterActiveTaskMap,
    assignmentsPerLocation,
    handleEditLocation,
    assignSpaceId,
    setAssignSpaceId,
    handleNavigateToProfile,
    handleAssignWorkers,
    handleViewTasks,
    assignSpaceRoster,
    rosterMutation,
    handleSaveRoster,
    locations,
    spaceNameById,
  } = useClientDashboardData();

  const activeSpaceByUser = useMemo(() => {
    const map = new Map<string, string>()
    const visible = new Set(locations.map((l: { id: string }) => l.id))
    for (const userId of clockedInUserIds) {
      const loc = attendanceByUser.get(userId)?.locationId
      if (loc && visible.has(loc)) {
        map.set(userId, loc) // clocked in at a visible space → active there
      } else {
        // Remote/off-grid clock-in → attribute to their first assigned space so
        // they appear once. locations is stable-ordered, so this is deterministic.
        for (const l of locations) {
          if (assignmentsPerLocation.get(l.id)?.has(userId)) { map.set(userId, l.id); break }
        }
      }
    }
    return map
  }, [clockedInUserIds, attendanceByUser, locations, assignmentsPerLocation])

  // ── Build Workspace Boxes ─────────────────────────────────────────────────

  // The card-building rules live in _lib/build-workspace-boxes — pure, and
  // tested there. This memo only supplies the inputs.
  const workspaceBoxes: WorkspaceBoxProps[] = useMemo(
    () =>
      buildWorkspaceBoxes({
        locations,
        tasks,
        members,
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
        isAdminOrDispatcher,
        // For the per-space capability checks on Manage / Add member — they
        // need the resolved grants, not just an id.
        currentUser: user,
        currentUserId: user?.id,
        handlers: {
          // Manage/assign are admin-only; employees get a read-only space view.
          onEdit: isAdminOrDispatcher ? handleEditLocation : undefined,
          onAssign: isAdminOrDispatcher ? handleAssignWorkers : undefined,
          onViewTasks: handleViewTasks,
          onPersonClick: handleNavigateToProfile,
        },
      }),
    [
      locations, tasks, members, assignmentsPerLocation,
      memberMap, clockedInUserIds, onBreakUserIds, attendanceByUser, shiftLabelInfo, activeTaskMap, rosterActiveTaskMap,
      activeSpaceByUser, spaceNameById,
      handleEditLocation, handleAssignWorkers, handleViewTasks, handleNavigateToProfile,
      isAdminOrDispatcher, user?.id, i18n.language,
    ],
  )

  // ── Live Events ────────────────────────────────────────────────────────────

  const liveEvents: LiveEvent[] = useMemo(
    () => buildRecentActivity({ tasks, todayEntries, memberMap }),
    [tasks, todayEntries, memberMap, i18n.language],
  )

  // ── Pending Actions ────────────────────────────────────────────────────────

  const pendingActions: PendingAction[] = useMemo(
    () =>
      buildPendingActions({
        tasks,
        onView: (id) => router.push(`/tasks/${id}`),
        approvals: pendingApprovals,
        // Hours are decided in Approvals — the one place.
        onReviewApproval: () => router.push("/approvals?kind=hours"),
      }),
    [tasks, router, pendingApprovals, i18n.language],
  )

  // ── Guide example team ───────────────────────────────────────────────────────
  // A brand-new dashboard is empty, so the guide would have no members to point at.
  // Until the user has completed their welcome guide (and only while their team is
  // still empty), we show an example space with example teammates so the guide —
  // and the onboarding dashboard itself — demonstrates how spaces, member statuses
  // and per-member actions work. It shows from the very first (empty) visit, and
  // disappears once the guide is finished OR real members exist. Nothing persisted.
  const welcomeTourId =
    user?.role === "ADMIN" ? "welcomeAdmin" : user?.canViewAllTasks ? "welcomeManager" : "welcomeEmployee"
  const guideActive = activeTourId === welcomeTourId
  const welcomeGuidePending = guideActive || !isTourCompleted(welcomeTourId)
  // The guide walks the SPACES and opens one to show its team. The open-space view
  // prominently shows the ACTIVE members (present on-site + in the field); off-duty /
  // off-shift only appear as a small side list. So the guide has "nobody to point at"
  // whenever no space has an active member — a brand-new org, members not yet assigned
  // to a space, OR a space whose whole team is currently off. In those cases we show
  // an example team so every guide step (open space → a teammate → actions) has real
  // content. Two gates so we never hide the user's own data outside the guide:
  //  • on a truly empty dashboard (no spaces) we show the example as an onboarding
  //    preview until the guide is completed;
  //  • on a dashboard that HAS spaces we only swap them for the example WHILE the
  //    guide is actively running, reverting the instant it ends.
  const spacesHaveActiveMembers = workspaceBoxes.some(
    (b) => (b.people?.length ?? 0) + (b.onRoadPeople?.length ?? 0) > 0,
  )
  const showExampleOnEmpty = welcomeGuidePending && !spacesHaveActiveMembers
  const showExampleInSpaces = guideActive && !spacesHaveActiveMembers
  const exampleSpace: WorkspaceBoxProps = {
    title: t("dashboard.client.exampleSpaceName"),
    type: "fixed",
    activeCount: 7,
    totalAssigned: 12,
    people: [
      { initials: "AM", color: "#2563EB", status: "on", clockedIn: true, name: "Ahmed M.", role: "Admin", tag: { text: t("dashboard.client.exampleOnShift"), variant: "hrs" } },
      { initials: "SW", color: "#7c3aed", status: "on", clockedIn: true, name: "Sara W.", role: "Employee", currentTask: t("dashboard.client.exampleJob"), tag: { text: t("dashboard.client.exampleOnShift"), variant: "hrs" } },
      { initials: "OF", color: "#0891b2", status: "on", clockedIn: true, name: "Omar F.", role: "Employee", tag: { text: t("dashboard.client.exampleOnShift"), variant: "hrs" } },
      { initials: "ER", color: "#16a34a", status: "on", clockedIn: true, name: "Emma R.", role: "Employee", tag: { text: t("dashboard.client.exampleOnShift"), variant: "hrs" } },
      { initials: "LK", color: "#ea580c", status: "on", clockedIn: true, name: "Leo K.", role: "Employee", tag: { text: t("dashboard.client.exampleOnShift"), variant: "hrs" } },
    ],
    onRoadPeople: [
      { initials: "MB", color: "#CA8A04", status: "busy", name: "Mike B.", role: "Employee", currentTask: t("dashboard.client.exampleJob"), tag: { text: t("dashboard.client.exampleInField"), variant: "task" } },
      { initials: "JP", color: "#db2777", status: "busy", name: "Jonas P.", role: "Employee", tag: { text: t("dashboard.client.exampleInField"), variant: "task" } },
    ],
    remotePeople: [
      { initials: "NK", color: "#0ea5e9", status: "away", name: "Nora K.", role: "Employee" },
      { initials: "YT", color: "#6366f1", status: "away", name: "Yuki T.", role: "Employee" },
    ],
    offDutyPeople: [
      { initials: "LA", color: "#64748b", status: "off", name: "Lisa A.", role: "Employee" },
      { initials: "TH", color: "#78716c", status: "off", name: "Tom H.", role: "Employee" },
      { initials: "AS", color: "#94a3b8", status: "off", name: "Anna S.", role: "Employee" },
    ],
    onEdit: () => router.push("/locations"),
    onAssign: () => router.push("/members"),
    onViewTasks: () => router.push("/tasks"),
    onPersonClick: () => router.push("/members"),
  }
  /** Boxes to render in a live dashboard: example teammates while the guide runs on an empty team. */
  const displayBoxes = showExampleInSpaces ? [exampleSpace] : workspaceBoxes

  // ── Render ─────────────────────────────────────────────────────────────────

  const greeting = getGreeting()

  return {
    user,
    t,
    isAdminOrDispatcher,
    isDataLoading,
    tasks,
    assignSpaceId,
    setAssignSpaceId,
    assignSpaceRoster,
    rosterMutation,
    handleSaveRoster,
    workspaceBoxes,
    liveEvents,
    pendingActions,
    showExampleOnEmpty,
    showExampleInSpaces,
    exampleSpace,
    displayBoxes,
    greeting,
  };
}
