"use client"

import { useMemo, useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Users } from "lucide-react"

import { getSpaceScope } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import {
  tasksApi,
  locationsApi,
  attendanceApi,
  organizationsApi,
  type OrgMember,
  type LocationAssignment,
  type Task,
} from "@/lib/api"
import type { TimeEntry } from "@hbcfield/shared"
import { AssignMemberDialog } from "@/components/assign-member-dialog"
import { isAssignedTo } from "@/lib/task-assignment"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
  WorkspaceGrid,
  ActivityPanel,
  RecentTasks,
  ManagementContacts,
  type RecentTask,
  type WorkspaceBoxProps,
  type LiveEvent,
  type PendingAction,
} from "@/components/dashboard"
import { ActivityPanelToggle } from "@/components/activity-panel-toggle"
import { useTour } from "@/components/tour"
import {
  getGreeting,
} from "./helpers"
import { buildRecentActivity, buildPendingActions } from "./dashboard-activity"
import { buildWorkspaceBoxes } from "../_lib/build-workspace-boxes"
import { useDashboardData } from "../_lib/use-dashboard-data"
import { EmptyWorkspace } from "./empty-workspace"
import { DashboardPageSkeleton, dashboardVariant } from "./dashboard-skeleton"

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map a Task to the compact RecentTask shape used by the dashboard list. */
function toRecentTask(tk: Task): RecentTask {
  return {
    id: tk.id,
    title: tk.title,
    status: tk.status,
    priority: tk.priority || "MEDIUM",
    dueDate: tk.dueDate ? new Date(tk.dueDate) : undefined,
    location: tk.locationAddress || undefined,
    createdAt: new Date(tk.updatedAt || Date.now()),
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClientDashboard() {
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
      queryClient.invalidateQueries({ queryKey: ["locationRosters"] })
      queryClient.invalidateQueries({ queryKey: ["space-assignments"] })
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

  // One-click approve straight from the panel; refresh the list so it drops off.
  const handleApproveEntry = useCallback(
    async (entryId: string) => {
      try {
        await attendanceApi.approveEntry(entryId)
      } finally {
        queryClient.invalidateQueries({ queryKey: ["pending-approvals"] })
        queryClient.invalidateQueries({ queryKey: ["attendance-active"] })
        queryClient.invalidateQueries({ queryKey: ["locationAttendanceBatch"] })
      }
    },
    [queryClient],
  )

  const pendingActions: PendingAction[] = useMemo(
    () =>
      buildPendingActions({
        tasks,
        onView: (id) => router.push(`/tasks/${id}`),
        approvals: pendingApprovals,
        onApproveEntry: handleApproveEntry,
        // Reject needs a reason → send them to the Approvals tab's reject dialog.
        onReviewApproval: () => router.push("/attendance?tab=approvals"),
      }),
    [tasks, router, pendingApprovals, handleApproveEntry, i18n.language],
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

  // Structural skeleton while the first fetch is in flight. Returning null here
  // blanked the screen between the route-level skeleton unmounting and the data
  // arriving; the skeleton mirrors the real layout so nothing jumps when it does.
  if (isDataLoading) {
    return <DashboardPageSkeleton variant={dashboardVariant(user)} />
  }

  const hasFixedLocations = workspaceBoxes.some(b => b.type === "fixed")

  // Empty state — no fixed locations to show
  if (!hasFixedLocations) {
    // Employees with no space view (tasks-only scope, or unassigned) get a
    // compact task-focused landing — NOT the admin "set up workspace" screen.
    if (!isAdminOrDispatcher) {
      const myTasks = tasks.filter((tk) => isAssignedTo(tk, user?.id)).slice(0, 6)
      return (
        <div className="mx-auto max-w-2xl px-6 py-8">
          <div data-tour="dash-emp-header">
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground mb-6">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
          </div>
          {/* Reach management — visible before tasks */}
          <div className="mb-6" data-tour="dash-emp-contacts">
            <ManagementContacts />
          </div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t("dashboard.client.myTasks")}</h2>
            <Link href="/tasks" className="text-xs text-primary hover:underline">{t("dashboard.client.viewAll")}</Link>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-2" data-tour="dash-emp-tasks">
            <RecentTasks tasks={myTasks.map(toRecentTask)} showViewAll={false} />
          </div>
        </div>
      )
    }

    return (
      <EmptyWorkspace
        isAdminOrDispatcher={isAdminOrDispatcher}
        showExample={showExampleOnEmpty}
        exampleSpace={exampleSpace}
      />
    )
  }

  // Employees with spaces get a 2-column layout: their (read-only) spaces on the
  // left, their own tasks always on the right. Admins/managers keep the live
  // Activity panel. Tasks are ALWAYS present for employees (here, or full-width
  // in the no-spaces landing above).
  if (!isAdminOrDispatcher) {
    const myTasks = tasks.filter((tk) => isAssignedTo(tk, user?.id))
    return (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* Main content — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
              <h1 className="text-2xl font-semibold text-foreground">
                {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
              </h1>
            </div>
            <ActivityPanelToggle />
          </div>

          {/* Balanced two columns: Spaces | My Tasks (stacks on small screens) */}
          <div className="max-w-[1440px] mx-auto px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
              {/* Spaces — a single space opens automatically */}
              <section data-tour="dash-spaces">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {showExampleInSpaces ? t("dashboard.client.exampleLabel") : t("dashboard.client.mySpaces")}
                </h2>
                <WorkspaceGrid boxes={displayBoxes} autoExpandSingle canSeeAbsenceReason={isAdminOrDispatcher} />
              </section>

              {/* Right column: management contacts (top, always visible) + my tasks */}
              <div className="space-y-6">
                {/* Reach management — independent of space membership */}
                <div data-tour="dash-emp-contacts">
                  <ManagementContacts />
                </div>

                <section data-tour="dash-emp-tasks">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">{t("dashboard.client.myTasks")}</h2>
                    <Link href="/tasks" className="text-xs text-primary hover:underline">{t("dashboard.client.viewAll")}</Link>
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-2">
                    <RecentTasks tasks={myTasks.slice(0, 15).map(toRecentTask)} showViewAll={false} />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Live Activity panel — always present, same as admin */}
        <ActivityPanel events={liveEvents} pending={pendingActions} className="h-full" />
      </div>
    )
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      {/* Main content — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <div style={{ paddingLeft: "max(0px, calc((100% - 1440px) / 2))" }}>
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrDispatcher && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                <Link href="/locations">
                  <Plus className="h-3.5 w-3.5" />
                  {t("dashboard.client.newSpace")}
                </Link>
              </Button>
            )}
            <ActivityPanelToggle />
          </div>
        </div>

        {/* Workspace Grid — contained. While the welcome guide runs on an empty
            team, `displayBoxes` becomes an example space so the tour has real
            teammates to demonstrate; it reverts the instant the guide ends. */}
        <div data-tour="dash-spaces" className="max-w-[1440px] mx-auto px-6 py-6">
          {showExampleInSpaces && (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("dashboard.client.exampleLabel")}
            </p>
          )}
          <WorkspaceGrid boxes={displayBoxes} autoExpandSingle={showExampleInSpaces} canSeeAbsenceReason={isAdminOrDispatcher} />
        </div>
      </div>

      {/* Right Activity Panel — flex sibling, full height */}
      <ActivityPanel events={liveEvents} pending={pendingActions} className="h-full" />

      {/* Assign member dialog — opens from workspace box "Add Member" button */}
      <AssignMemberDialog
        open={!!assignSpaceId}
        onOpenChange={(open) => { if (!open) setAssignSpaceId(null) }}
        taskId={null}
        spaceId={assignSpaceId}
        currentAssigneeIds={assignSpaceRoster.map((a) => a.userId)}
        isAssigning={rosterMutation.isPending}
        onAssign={() => {}}
        onSave={handleSaveRoster}
      />

    </div>
  )
}
