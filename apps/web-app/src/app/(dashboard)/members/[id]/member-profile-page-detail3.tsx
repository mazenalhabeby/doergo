"use client"

import { personName } from "@hbcfield/shared/client"
import {
  MapPin,
  Clock,
  LayoutGrid,
  ShieldCheck,
  ClipboardList,
  Calendar,
  Umbrella,
  BarChart3,
  Package,
  Receipt,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  StatementTab,
  AttendanceTab,
  LocationsTab,
  ScheduleTab,
  HoldingsTab,
  useWarmMemberTabs,
} from "./member-tabs-lazy"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { type ScheduleEntry } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { PerformanceTab, AccessBuilder, AuditTrail, TimeOffTab, DAY_KEYS } from "./member-profile-page-helpers"
import { MemberProfilePageDetail } from "./member-profile-page-detail"
import { MemberProfilePageDetail2 } from "./member-profile-page-detail2"
import { MemberProfilePagePrevious } from "./member-profile-page-previous"
import type { MemberProfilePageState } from "./use-member-profile-page"
import type { MemberProfilePageView } from "./member-profile-page-view"

/** Part of MemberProfilePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MemberProfilePageDetail3({
  vm,
  isExternalMember,
}: {
  vm: MemberProfilePageState
  isExternalMember: ReturnType<typeof MemberProfilePageView>["isExternalMember"]
}) {
  useWarmMemberTabs()
  const {
    canManageMembers,
    member,
    scheduleLoading,
    schedule,
    t,
    formatSchedule,
    canViewOps,
    activeTab,
    setActiveTab,
    canViewLabourCost,
    memberId,
    handleMemberSaved,
    attendance,
    canManage,
    memberAssignments,
    performance,
    memberLoading,
    memberError,
  } = vm
  if (memberLoading) return null
  if (memberError) return null
  if (!member) return null
  return (
    <>
      {(() => {
        // Admins get an Access tab for EVERY member, including other admins and
        // themselves — so an admin can manage attendance capabilities like remote
        // clock-in (allowRemote) that apply to admins too. Role changes for self /
        // the last admin remain blocked in the builder + backend.
        // Matches the server: PATCH /organizations/members/:id is
        // @RequirePermission('canManageUsers'), not ADMIN-only. Gating the tab on
        // isAdmin hid the screen from managers who could still make the same edit
        // through the API (audit MD-B1).
        const showAccessTab = canManageMembers
        // Schedule box is dynamic: only shows for a FIXED member that actually
        // has hours set. Flexible / none / empty → the box disappears entirely.
        const showSchedule = member.scheduleType === "FIXED" && (scheduleLoading || schedule.length > 0)

        const activityCard = <MemberProfilePageDetail2 vm={vm} />

        const overview = (
          <div className="space-y-6">
            <div data-tour="member-tasks" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Recent Tasks ─────────────────────────────────────────── */}
              <MemberProfilePageDetail vm={vm} />

              {/* ── Right column: Schedule if the member has fixed hours, else Activity ── */}
              {showSchedule ? (
                <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-border/60">
                    <h2 className="text-sm font-semibold text-foreground">{t("members.detail.schedule")}</h2>
                  </div>
                  {scheduleLoading ? (
                    <div className="p-5 space-y-2">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={i} className="h-5 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {DAY_KEYS.map((dayKey, i) => {
                        const entry = schedule.find((s: ScheduleEntry) => s.dayOfWeek === i)
                        const isActive = entry?.isActive
                        return (
                          <div
                            key={i}
                            className={cn("flex items-center justify-between px-5 py-2.5", !isActive && "opacity-40")}
                          >
                            <span className="text-sm font-medium text-foreground w-10">
                              {t(`common.weekdaysShort.${dayKey}`)}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {isActive
                                ? `${formatSchedule(entry!.startTime)} - ${formatSchedule(entry!.endTime)}`
                                : t("members.detail.off")}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                activityCard
              )}
            </div>

            {/* Activity drops to a full-width row only when Schedule took the slot */}
            {showSchedule && activityCard}
          </div>
        )

        // No tabs to show (plain member viewing a peer / self) → just the overview.
        if (!showAccessTab && !canViewOps) return overview

        const triggerCls =
          "data-[state=active]:bg-foreground data-[state=active]:text-background " +
          "data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium " +
          "transition-all gap-1.5"

        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-card border border-border/60 rounded-xl p-1 shadow-sm h-auto flex-wrap">
              <TabsTrigger value="overview" className={triggerCls}>
                <LayoutGrid className="size-3.5" />
                {t("members.detail.overview")}
              </TabsTrigger>
              {showAccessTab && (
                <TabsTrigger
                  data-tour="access-tab"
                  value="access"
                  onClick={() => setActiveTab("access")}
                  className={triggerCls}
                >
                  <ShieldCheck className="size-3.5" />
                  {t("members.detail.access")}
                </TabsTrigger>
              )}
              {canViewOps && (
                <>
                  <TabsTrigger value="tasks" className={triggerCls}>
                    <ClipboardList className="size-3.5" />
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
                      <Clock className="size-3.5" />
                      {t("technicians.detail.tabs.attendance")}
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="locations" className={triggerCls}>
                    <MapPin className="size-3.5" />
                    {t("technicians.detail.tabs.locations")}
                  </TabsTrigger>
                  {/* What has been handed to them — a van, a laptop, a key.
                    Shown for everybody who can see the operational tabs:
                    the tab body says "nothing" when there is nothing, which
                    is a real answer and the one somebody checking asset
                    returns on a leaver's last day is looking for. */}
                  <TabsTrigger value="holdings" className={triggerCls}>
                    <Package className="size-3.5" />
                    {t("custody.tab", "Custody")}
                  </TabsTrigger>
                  {/* Weekly schedule only applies to FIXED-hours members; flexible/
                    none members work to a monthly budget, so hide the tab. */}
                  {member.scheduleType === "FIXED" && (
                    <TabsTrigger value="schedule" className={triggerCls}>
                      <Calendar className="size-3.5" />
                      {t("technicians.detail.tabs.schedule")}
                    </TabsTrigger>
                  )}
                  {!isExternalMember && (
                    <TabsTrigger value="time-off" className={triggerCls}>
                      <Umbrella className="size-3.5" />
                      {t("technicians.detail.tabs.timeOff")}
                    </TabsTrigger>
                  )}
                  {!isExternalMember && (
                    <TabsTrigger value="performance" className={triggerCls}>
                      <BarChart3 className="size-3.5" />
                      {t("technicians.detail.tabs.performance")}
                    </TabsTrigger>
                  )}
                  {/* We neither pay nor bill an external member, so there is no statement. */}
                  {!isExternalMember && canViewLabourCost && (
                    <TabsTrigger value="statement" className={triggerCls}>
                      <Receipt className="size-3.5" />
                      {t("members.statement.tab")}
                    </TabsTrigger>
                  )}
                </>
              )}
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="space-y-6">
                {overview}
                {/* Full accountability audit trail — managers only (self-gated) */}
                <AuditTrail resourceType="members" resourceId={memberId} />
              </div>
            </TabsContent>

            {showAccessTab && (
              <TabsContent value="access" className="mt-6">
                <div className="space-y-6">
                  <AccessBuilder member={member} onSaved={handleMemberSaved} />
                </div>
              </TabsContent>
            )}

            {canViewOps && (
              <>
                <MemberProfilePagePrevious vm={vm} />
                {/* Gated with their triggers above — a mounted panel for a
                  hidden tab still fetches, so leaving these in would query
                  attendance and time-off for somebody who has neither. */}
                {!isExternalMember && (
                  <TabsContent value="attendance" className="mt-6">
                    <AttendanceTab
                      attendance={attendance}
                      employeeId={memberId}
                      employeeName={personName(member)}
                      canManage={canManage}
                    />
                  </TabsContent>
                )}
                <TabsContent value="holdings" className="mt-6">
                  <HoldingsTab memberId={memberId} />
                </TabsContent>
                <TabsContent value="locations" className="mt-6">
                  <LocationsTab
                    assignments={memberAssignments}
                    memberAllowRemote={member.allowRemote}
                    canManage={canManage}
                  />
                </TabsContent>
                {member.scheduleType === "FIXED" && (
                  <TabsContent value="schedule" className="mt-6">
                    <ScheduleTab employeeId={memberId} canManage={canManage} />
                  </TabsContent>
                )}
                {!isExternalMember && (
                  <TabsContent value="time-off" className="mt-6">
                    <TimeOffTab employeeId={memberId} employeeName={personName(member)} canManage={canManage} />
                  </TabsContent>
                )}
                {!isExternalMember && (
                  <TabsContent value="performance" className="mt-6">
                    <PerformanceTab performance={performance} />
                  </TabsContent>
                )}
                {!isExternalMember && canViewLabourCost && (
                  <TabsContent value="statement" className="mt-6">
                    <StatementTab memberId={memberId} />
                  </TabsContent>
                )}
              </>
            )}
          </Tabs>
        )
      })()}
    </>
  )
}
