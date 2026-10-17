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
import { useTour } from "@/components/tour";
import { useDashboardData } from "../_lib/use-dashboard-data";

/** useClientDashboard's state and handlers — everything before its markup, moved here unchanged. */
export function useClientDashboardData() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  // Drives the guide example team (see below).
  const { activeTourId, isTourCompleted } = useTour()
  // All reads live in useDashboardData; this component is presentation.
  const {
    isAdminOrDispatcher,
    spaceScope,
    isLoading: isDataLoading,
    tasks,
    allLocations,
    members,
    rosters,
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
  } = useDashboardData(user)

  const handleEditLocation = useCallback((locationId: string) => {
    // "Manage Space" → that space's own settings page, not the all-spaces list.
    router.push(`/locations/${locationId}`)
  }, [router])

  const [assignSpaceId, setAssignSpaceId] = useState<string | null>(null)
  const handleNavigateToProfile = useCallback((userId: string) => {
    router.push(`/members/${userId}`)
  }, [router])

  const handleAssignWorkers = useCallback((locationId: string) => {
    setAssignSpaceId(locationId)
  }, [])

  const handleViewTasks = useCallback((locationId: string) => {
    router.push(`/tasks?space=${locationId}`)
  }, [router])

  // ── Space roster mutation ─────────────────────────────────────────────────

  // Assignments for the space the dialog is editing — supplies both the dialog's
  // initial selection and the assignment ids needed to remove someone (the API
  // deletes by assignment id, not user id).
  const assignSpaceRoster = useMemo(
    () => (assignSpaceId ? rosters.filter((a) => a.locationId === assignSpaceId) : []),
    [rosters, assignSpaceId],
  )

  /**
   * Persist a roster edit made from a space card. This dialog previously got an
   * empty `onAssign` and no `onSave`, which left it in single-select mode calling
   * a no-op — the picker looked functional but never wrote anything.
   *
   * Removals go first so that swapping a member can't transiently exceed a space
   * cap, and both directions run concurrently within their phase. Partial
   * failures are reported rather than swallowed, matching the bulk actions on the
   * members page.
   */
  const rosterMutation = useMutation({
    mutationFn: async ({ spaceId, added, removed }: { spaceId: string; added: string[]; removed: string[] }) => {
      const assignmentIdByUser = new Map(assignSpaceRoster.map((a) => [a.userId, a.id]))

      const settle = async (jobs: Promise<unknown>[]) => {
        const results = await Promise.allSettled(jobs)
        return results.filter((r) => r.status === "rejected").length
      }

      let failed = await settle(
        removed
          .map((userId) => assignmentIdByUser.get(userId))
          .filter((id): id is string => !!id)
          .map((assignmentId) => locationsApi.removeAssignment(spaceId, assignmentId)),
      )
      failed += await settle(added.map((userId) => locationsApi.assignMember(spaceId, { userId })))

      return { failed, total: added.length + removed.length }
    },
    onSuccess: ({ failed, total }) => {
      if (failed > 0) {
        notify.error(t("dashboard.client.assignPartial", { ok: total - failed, failed }))
      } else if (total > 0) {
        notify.success(t("dashboard.client.assignSaved", { count: total }))
      }
    },
    onError: (error: Error) => notify.error(error.message),
    onSettled: () => {
      // The rosters drive the space cards, and the dialog reads its own copy.
      queryClient.invalidateQueries({ queryKey: keys.locations.rosterBatches() })
      queryClient.invalidateQueries({ queryKey: keys.locations.rosters() })
    },
  })

  const handleSaveRoster = useCallback(
    async (added: string[], removed: string[]) => {
      if (!assignSpaceId) return
      await rosterMutation.mutateAsync({ spaceId: assignSpaceId, added, removed })
    },
    [assignSpaceId, rosterMutation],
  )

  // ── Loading ────────────────────────────────────────────────────────────────

  // Role-based + Access-Profile space-scope filtering.
  //   admin/manager → all spaces
  //   scope 'tasks' → NO spaces (tasks-only landing)
  //   scope 'all'   → read-only overview of every space
  //   scope 'own'   → only the spaces they're a roster member of (or assigned a task in)
  const locations = useMemo(() => {
    if (isAdminOrDispatcher) return allLocations
    if (spaceScope === "tasks") return []
    if (spaceScope === "all") return allLocations
    // 'own' — spaces where the user is on the roster, plus any space a task of
    // theirs lives in (covers ad-hoc assignments without a roster entry).
    const userSpaceIds = new Set<string>()
    for (const [locId, ids] of assignmentsPerLocation) {
      if (user?.id && ids.has(user.id)) userSpaceIds.add(locId)
    }
    for (const task of tasks) {
      if (task.spaceId && isAssignedTo(task, user?.id)) userSpaceIds.add(task.spaceId)
    }
    if (userSpaceIds.size === 0) return []
    return allLocations.filter((loc: { id: string }) => userSpaceIds.has(loc.id))
  }, [isAdminOrDispatcher, spaceScope, allLocations, tasks, user?.id, assignmentsPerLocation])

  // A clocked-in member is physically in ONE place. Resolve their single "active
  // space": the space they clocked in at (if visible), else — for a remote/field
  // clock-in whose location isn't a visible space — their first assigned space, so
  // they surface as active exactly once instead of showing "remotely" in every
  // space they belong to. Pure in-memory over already-loaded maps (no queries).
  const spaceNameById = useMemo(
    () => new Map(allLocations.map((l: { id: string; name: string }) => [l.id, l.name])),
    [allLocations],
  )

  return {
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
  };
}
