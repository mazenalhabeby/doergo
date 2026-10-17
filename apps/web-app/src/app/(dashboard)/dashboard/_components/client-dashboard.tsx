"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useCallback, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { canManageSpace } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import {
  locationsApi,
  type Task,
} from "@/lib/api"
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
import { DocumentsReminderBanner } from "@/components/documents-reminder-banner"
import { cn } from "@/lib/utils";
import { PAGE_SHELL, PAGE_WIDTH } from "@/components/ui/page-width";
import { FindPerson } from "@/components/people/find-person"
import { useClientDashboard } from "./use-client-dashboard";
import { toRecentTask } from "./client-dashboard-helpers";

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Component ────────────────────────────────────────────────────────────────

export function ClientDashboard() {
  const {
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
  } = useClientDashboard();

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
          <div className={PAGE_SHELL}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
              {/* Spaces — a single space opens automatically */}
              <section data-tour="dash-spaces">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {showExampleInSpaces ? t("dashboard.client.exampleLabel") : t("dashboard.client.mySpaces")}
                </h2>
                <WorkspaceGrid boxes={displayBoxes} autoExpandSingle canSeeAbsenceReason={isAdminOrDispatcher} />
              </section>

              {/* Right column: management contacts (natural height) + my tasks.
                  On lg+ the column is a viewport-tall flex column pinned in view,
                  so My Tasks FILLS whatever height is left after the contacts card
                  (dynamic — no hardcoded subtraction) and scrolls internally.
                  On mobile it stacks and flows normally. */}
              <div className="space-y-6 lg:space-y-0 lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-7rem)] lg:flex-col lg:gap-6">
                {/* Reach management — independent of space membership */}
                <div data-tour="dash-emp-contacts" className="lg:shrink-0">
                  <ManagementContacts />
                </div>

                <section data-tour="dash-emp-tasks" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">{t("dashboard.client.myTasks")}</h2>
                    <Link href="/tasks" className="text-xs text-primary hover:underline">{t("dashboard.client.viewAll")}</Link>
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
            <FindPerson />
            {/* Creating a workspace needs `canManageWorkspaces`, org-wide —
                `isAdminOrDispatcher` is "can view all tasks", which a member
                can now legitimately hold in a single space. That offered the
                button to somebody the endpoint refuses. No spaceId here on
                purpose: creating one is not an action inside any space. */}
            {canManageSpace(user) && (
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

        {/* Outstanding personal documents — once, here, and a count on the nav
            item. See the component for why it is not on every page. Renders
            nothing when there is none, which is the normal case. */}
        <div className={cn(PAGE_WIDTH, "pt-4")}>
          <DocumentsReminderBanner />
        </div>

        {/* Workspace Grid — contained. While the welcome guide runs on an empty
            team, `displayBoxes` becomes an example space so the tour has real
            teammates to demonstrate; it reverts the instant the guide ends. */}
        <div data-tour="dash-spaces" className={PAGE_SHELL}>
          {showExampleInSpaces && (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("dashboard.client.exampleLabel")}
            </p>
          )}
          {/*
            One space opens itself.

            The grid only auto-expands when there is EXACTLY one box, so this is
            unconditional rather than guessing: somebody with a single workspace
            — a supervisor of one site, a small company — had to click their
            only card to see anything, and the collapsed chip showed nothing
            worth having. Somebody with several still chooses.

            The other render of this grid (the two-column layout above) has
            always passed it; this one only did while the guide's example was up,
            so the same dashboard behaved differently depending which branch
            drew it.
          */}
          <WorkspaceGrid boxes={displayBoxes} autoExpandSingle canSeeAbsenceReason={isAdminOrDispatcher} />
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
