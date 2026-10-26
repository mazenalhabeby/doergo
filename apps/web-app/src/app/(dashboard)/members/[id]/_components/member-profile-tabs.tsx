"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  employeesApi,
  type OrgMember,
  type PerformanceMetrics,
  type ScheduleEntry,
  type Task,
  type TimeEntry,
} from "@/lib/api"
// Worker tabs — consolidated from the retired /employees page (single member page).
// Imported from the leaf modules, NOT the barrel: `_components/index.ts` also
// re-exports PerformanceTab, so importing through it risks pulling recharts back
// into this chunk and undoing the split.
import {
  StatementTab,
  AttendanceTab,
  LocationsTab,
  ScheduleTab,
  HoldingsTab,
  PerformanceTab,
  AccessBuilder,
  AuditTrail,
  TimeOffTab,
  useWarmMemberTabs,
} from "./member-tabs-lazy"
import { MemberOverview } from "./member-overview"
import { MemberTasksPanel } from "./member-tasks-panel"

interface MemberProfileTabsProps {
  member: OrgMember
  memberId: string
  canManageMembers: boolean
  canViewOps: boolean
  canManage: boolean
  activeTab: string
  setActiveTab: (tab: string) => void
  tasks: Task[]
  tasksLoading: boolean
  schedule: ScheduleEntry[]
  scheduleLoading: boolean
  fullTasks: Task[] | undefined
  tasksPage: number
  setTasksPage: Dispatch<SetStateAction<number>>
  tasksPageSize: number
  attendance: TimeEntry[] | undefined
  memberAssignments: Awaited<ReturnType<typeof employeesApi.getAssignments>>
  performance: PerformanceMetrics | undefined
  onMemberSaved: () => void
}

/** The member page under the header: the Overview, and the tabs the viewer may open. */
export function MemberProfileTabs({
  member,
  memberId,
  canManageMembers,
  canViewOps,
  canManage,
  activeTab,
  setActiveTab,
  tasks,
  tasksLoading,
  schedule,
  scheduleLoading,
  fullTasks,
  tasksPage,
  setTasksPage,
  tasksPageSize,
  attendance,
  memberAssignments,
  performance,
  onMemberSaved,
}: MemberProfileTabsProps) {
  useWarmMemberTabs()
  const { t } = useTranslation()
  // The statement is what a person's hours cost the company — only for those who may see that.
  const { user: viewer, hasPermission } = useAuth()
  /*
    The server's own keys (clock review C4) — "can see all tasks" was enough to be OFFERED these, and the server
    then refused: adding a missed day needs "correct hours"; the away override per workspace needs "manage
    workspaces".
  */
  const canCorrectHours = hasPermission("canReconcileAttendance")
  const canSetAway = hasPermission("canManageWorkspaces")
  const canViewLabourCost = (viewer as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  /* Works for a client or partner — see the tab list below for what that hides. */
  const isExternalMember = member.isExternal === true

  // Admins get an Access tab for EVERY member, including other admins and
  // themselves — so an admin can manage attendance capabilities like remote
  // clock-in (allowRemote) that apply to admins too. Role changes for self /
  // the last admin remain blocked in the builder + backend.
  // Matches the server: PATCH /organizations/members/:id is
  // @RequirePermission('canManageUsers'), not ADMIN-only. Gating the tab on
  // isAdmin hid the screen from managers who could still make the same edit
  // through the API (audit MD-B1).
  const showAccessTab = canManageMembers

  const overview = (
    <MemberOverview
      member={member}
      memberId={memberId}
      tasks={tasks}
      tasksLoading={tasksLoading}
      schedule={schedule}
      scheduleLoading={scheduleLoading}
    />
  )

  // No tabs to show (plain member viewing a peer / self) → just the overview.
  if (!showAccessTab && !canViewOps) return overview

  // The board's underline tabs: the chosen one in ink with a 2px rule, the rest soft.
  const triggerCls =
    "-mb-px h-[42px] rounded-none border-b-2 border-transparent bg-transparent px-0 text-[13.5px] font-medium " +
    "text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground " +
    "data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground " +
    "data-[state=active]:shadow-none"

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-x-[22px] rounded-none border-b border-border bg-transparent p-0">
        <TabsTrigger value="overview" className={triggerCls}>
          {t("members.detail.overview")}
        </TabsTrigger>
        {showAccessTab && (
          <TabsTrigger
            data-tour="access-tab"
            value="access"
            onClick={() => setActiveTab("access")}
            className={triggerCls}
          >
            {t("members.detail.access")}
          </TabsTrigger>
        )}
        {canViewOps && (
          <>
            <TabsTrigger value="tasks" className={triggerCls}>
              {t("technicians.detail.tabs.tasks")}
            </TabsTrigger>
            {/* Nothing an external member could ever fill: they do not
              clock in here, book no leave with us, and their
              performance is our own workers' output, not theirs. A
              tab that can never hold anything reads as a broken
              feature rather than an empty one. Tasks STAYS — work can
              genuinely be assigned to them, so hiding it would lose
              real data the first time somebody does. */}
            {!isExternalMember && (
              <TabsTrigger value="attendance" className={triggerCls}>
                {t("technicians.detail.tabs.attendance")}
              </TabsTrigger>
            )}
            <TabsTrigger value="locations" className={triggerCls}>
              {t("technicians.detail.tabs.locations")}
            </TabsTrigger>
            {/* What has been handed to them — a van, a laptop, a key.
              Shown for everybody who can see the operational tabs:
              the tab body says "nothing" when there is nothing, which
              is a real answer and the one somebody checking asset
              returns on a leaver's last day is looking for. */}
            <TabsTrigger value="holdings" className={triggerCls}>
              {t("custody.tab", "Custody")}
            </TabsTrigger>
            {/* Weekly schedule only applies to FIXED-hours members; flexible/
              none members work to a monthly budget, so hide the tab. */}
            {member.scheduleType === "FIXED" && (
              <TabsTrigger value="schedule" className={triggerCls}>
                {t("technicians.detail.tabs.schedule")}
              </TabsTrigger>
            )}
            {!isExternalMember && (
              <TabsTrigger value="time-off" className={triggerCls}>
                {t("technicians.detail.tabs.timeOff")}
              </TabsTrigger>
            )}
            {!isExternalMember && (
              <TabsTrigger value="performance" className={triggerCls}>
                {t("technicians.detail.tabs.performance")}
              </TabsTrigger>
            )}
            {/* We neither pay nor bill an external member, so there is no statement. */}
            {!isExternalMember && canViewLabourCost && (
              <TabsTrigger value="statement" className={triggerCls}>
                {t("members.statement.tab")}
              </TabsTrigger>
            )}
          </>
        )}
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <div className="space-y-4">
          {overview}
          {/* Full accountability audit trail — managers only (self-gated) */}
          <AuditTrail resourceType="members" resourceId={memberId} />
        </div>
      </TabsContent>

      {showAccessTab && (
        <TabsContent value="access" className="mt-4">
          <div className="space-y-4">
            <AccessBuilder member={member} onSaved={onMemberSaved} />
          </div>
        </TabsContent>
      )}

      {canViewOps && (
        <>
          <MemberTasksPanel
            fullTasks={fullTasks}
            tasksPage={tasksPage}
            setTasksPage={setTasksPage}
            tasksPageSize={tasksPageSize}
          />
          {/* Gated with their triggers above — a mounted panel for a
            hidden tab still fetches, so leaving these in would query
            attendance and time-off for somebody who has neither. */}
          {!isExternalMember && (
            <TabsContent value="attendance" className="mt-4">
              <AttendanceTab
                attendance={attendance}
                employeeId={memberId}
                employeeName={personName(member)}
                canManage={canManage}
                canAddAttendance={canCorrectHours}
              />
            </TabsContent>
          )}
          <TabsContent value="holdings" className="mt-4">
            <HoldingsTab memberId={memberId} />
          </TabsContent>
          <TabsContent value="locations" className="mt-4">
            <LocationsTab
              assignments={memberAssignments}
              memberAllowRemote={member.allowRemote}
              canManage={canSetAway}
            />
          </TabsContent>
          {member.scheduleType === "FIXED" && (
            <TabsContent value="schedule" className="mt-4">
              <ScheduleTab employeeId={memberId} canManage={canManage} />
            </TabsContent>
          )}
          {!isExternalMember && (
            <TabsContent value="time-off" className="mt-4">
              <TimeOffTab employeeId={memberId} employeeName={personName(member)} canManage={canManage} />
            </TabsContent>
          )}
          {!isExternalMember && (
            <TabsContent value="performance" className="mt-4">
              <PerformanceTab performance={performance} />
            </TabsContent>
          )}
          {!isExternalMember && canViewLabourCost && (
            <TabsContent value="statement" className="mt-4">
              <StatementTab memberId={memberId} />
            </TabsContent>
          )}
        </>
      )}
    </Tabs>
  )
}
