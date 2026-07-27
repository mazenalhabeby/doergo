"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { Clock, XCircle, ClipboardCheck, Coffee } from "lucide-react"
import { format } from "date-fns"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { attendanceApi, employeesApi, locationsApi, type TimeEntry, type TimeEntryStatus, type Break, type BreakType } from "@/lib/api"
import { ApprovalsTab } from "./_components/approvals-tab"
import { BreaksTab } from "./_components/breaks-tab"
import { TrackingTab } from "./_components/tracking-tab"
import { AddAttendanceDialog } from "../employees/[id]/_components/add-attendance-dialog"
import { AddDayOffDialog } from "./_components/add-dayoff-dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"

export default function AttendancePage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracking" | "approvals" | "breaks">("tracking")

  // Honor a ?tab= deep-link (e.g. the dashboard's "Pending Actions" reject link
  // → /attendance?tab=approvals). Read after mount to avoid a hydration mismatch.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab === "approvals" || tab === "breaks" || tab === "tracking") {
      setActiveTab(tab)
    }
  }, [])

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  // Date filter is a From–To range (defaults to a single day: today→today).
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  )
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  )
  const [page, setPage] = useState(1)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce the search box → server-side search across all pages; reset to
  // page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchQuery])
  const limit = 20

  // Normalized date range (guards against an inverted To < From).
  const rangeStart = endDate < selectedDate ? endDate : selectedDate
  const rangeEnd = endDate < selectedDate ? selectedDate : endDate

  // Reports states
  // reportType and reportLocationId moved to ReportsTab component

  // Check role - only ADMIN and DISPATCHER can access
  const canAccess = user?.role === "ADMIN" || !!user?.canViewAllTasks
  const isAdmin = user?.role === "ADMIN"

  // Fetch locations
  const { data: locationsRaw, isLoading: loadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    enabled: canAccess,
    staleTime: 60_000,
  })
  const locations = locationsRaw?.data || []

  // Fetch attendance entries - use getAllEntries for "all" locations, otherwise use getLocationEntries
  const {
    data: attendanceData,
    isLoading: loadingEntries,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["attendance", selectedLocationId, selectedStatus, selectedDate, endDate, debouncedSearch, page, limit],
    queryFn: () => {
      if (selectedLocationId === "all") {
        // Use getAllEntries for organization-wide view
        return attendanceApi.getAllEntries({
          startDate: rangeStart,
          endDate: rangeEnd,
          status: selectedStatus !== "all" ? selectedStatus as TimeEntryStatus : undefined,
          search: debouncedSearch || undefined,
          page,
          limit,
        })
      }
      return attendanceApi.getLocationEntries(selectedLocationId, {
        startDate: rangeStart,
        endDate: rangeEnd,
        search: debouncedSearch || undefined,
        page,
        limit,
      })
    },
    enabled: canAccess,
    placeholderData: keepPreviousData, // keep the table visible while paging/filtering
    staleTime: 30_000,
    refetchInterval: activeTab === "tracking" ? 30_000 : false, // live refresh on the Tracking tab
  })

  // Approved time-off, shown as inline "day off" rows in the tracking table.
  const { data: orgTimeOff } = useQuery({
    queryKey: ["orgTimeOff", "APPROVED"],
    queryFn: () => employeesApi.getOrgTimeOff("APPROVED"),
    enabled: canAccess && activeTab === "tracking",
    staleTime: 60_000,
  })

  // Day-off rows for the current view: overlapping the selected range, matching
  // the name search. Only in the org-wide view (time off isn't site-scoped) and
  // only on page 1 so they aren't repeated across paginated clock entries.
  const daysOff = useMemo(() => {
    if (selectedLocationId !== "all" || page !== 1) return []
    const q = debouncedSearch.trim().toLowerCase()
    return (orgTimeOff ?? [])
      .filter((r) => {
        const rs = r.startDate.slice(0, 10)
        const re = r.endDate.slice(0, 10)
        if (!(rs <= rangeEnd && re >= rangeStart)) return false
        if (q) {
          const name = `${r.technician?.firstName ?? ""} ${r.technician?.lastName ?? ""}`.toLowerCase()
          if (!name.includes(q)) return false
        }
        return true
      })
      .map((r) => ({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        technician: r.technician,
      }))
  }, [orgTimeOff, selectedLocationId, page, rangeStart, rangeEnd, debouncedSearch])

  // Fetch scheduler info (ADMIN only)
  const { data: schedulerInfo } = useQuery({
    queryKey: ["scheduler-info"],
    queryFn: () => attendanceApi.getSchedulerInfo(),
    // Only the Tracking tab renders the scheduler panel — don't fetch otherwise.
    enabled: isAdmin && activeTab === "tracking",
    staleTime: 30_000,
  })

  // Trigger auto clock-out mutation
  const triggerAutoClockOut = useMutation({
    mutationFn: (type: "hourly" | "midnight") => attendanceApi.triggerAutoClockOut(type),
    onSuccess: (data) => {
      notify.success(data?.data?.message || t('attendance.toast.autoClockOutTriggered'))
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["scheduler-info"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t('attendance.toast.autoClockOutFailed'))
    },
  })

  // Weekly/monthly reports moved to ReportsTab component

  // Fetch pending approvals. Runs whenever the page is open (not just on the
  // Approvals tab) so the tab's count badge is visible immediately on load.
  const { data: pendingApprovalsData, isLoading: loadingApprovals, refetch: refetchApprovals } = useQuery({
    queryKey: ["attendance-approvals"],
    queryFn: () => attendanceApi.getPendingApprovals({ limit: 50 }),
    enabled: canAccess,
    staleTime: 30_000,
  })

  // Breaks state
  const [breakDate, setBreakDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("all")

  // Fetch active breaks
  const { data: activeBreaks = [], isLoading: loadingActiveBreaks, refetch: refetchActiveBreaks } = useQuery({
    queryKey: ["attendance-breaks-active"],
    queryFn: () => attendanceApi.getActiveBreaks(),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
    refetchInterval: activeTab === "breaks" ? 30_000 : false, // live: who's on break now
  })

  // Fetch break history
  const { data: breakHistoryData, isLoading: loadingBreakHistory, refetch: refetchBreakHistory } = useQuery({
    queryKey: ["attendance-breaks-history", breakDate, breakTypeFilter],
    queryFn: () => attendanceApi.getBreakHistory({
      date: breakDate,
      type: breakTypeFilter !== "all" ? breakTypeFilter as BreakType : undefined,
      limit: 50,
    }),
    enabled: canAccess && activeTab === "breaks",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  // Fetch break summary for the selected date
  const { data: breakSummary, isLoading: loadingBreakSummary } = useQuery({
    queryKey: ["attendance-breaks-summary", breakDate],
    queryFn: () => attendanceApi.getBreakSummary({
      startDate: breakDate,
      endDate: breakDate,
    }),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
  })

  // End break mutation
  const endBreakManually = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes?: string }) =>
      attendanceApi.endBreakManually(breakId, notes),
    onSuccess: () => {
      notify.success(t('attendance.toast.breakEnded'))
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-active"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-breaks-history"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t('attendance.toast.breakEndFailed'))
    },
  })

  // Export CSV moved to ReportsTab component

  // Approve entry mutation
  const approveEntry = useMutation({
    mutationFn: (entryId: string) => attendanceApi.approveEntry(entryId),
    onSuccess: () => {
      notify.success(t('attendance.toast.entryApproved'))
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t('attendance.toast.approveFailed'))
    },
  })

  // Reject entry mutation
  const [rejectReason, setRejectReason] = useState("")
  const rejectEntry = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      attendanceApi.rejectEntry(entryId, reason),
    onSuccess: () => {
      notify.success(t('attendance.toast.entryRejected'))
      setRejectReason("")
      queryClient.invalidateQueries({ queryKey: ["attendance-approvals"] })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t('attendance.toast.rejectFailed'))
    },
  })

  const entries = attendanceData?.data || []
  const meta = attendanceData?.meta

  // Calculate stats
  const stats = useMemo(() => {
    const activeCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_IN").length
    const completedCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_OUT").length
    const autoOutCount = entries.filter((e: TimeEntry) => e.status === "AUTO_OUT").length
    const totalMinutes = entries.reduce(
      (sum: number, e: TimeEntry) => sum + (e.totalMinutes || 0),
      0
    )

    return {
      active: activeCount,
      completed: completedCount,
      autoOut: autoOutCount,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    }
  }, [entries])

  // Filter entries with geofence violations
  const geofenceViolations = useMemo(() => {
    return entries.filter((e: TimeEntry) =>
      !e.clockInWithinGeofence || (e.clockOutAt && e.clockOutWithinGeofence === false)
    )
  }, [entries])

  // Client-side search filter
  // Search is now server-side (matches across all pages), so the fetched
  // entries are already filtered — no client-side narrowing needed.
  const filteredEntries = entries

  // Not authorized
  if (!canAccess) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{t('common.accessDenied')}</h2>
          <p className="text-muted-foreground mt-2">
            {t('common.noPermissionView')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                {t('attendance.management.title')}
              </h1>
              <p className="mt-1.5 text-muted-foreground">
                {t('attendance.management.subtitle')}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <AddDayOffDialog />
                <AddAttendanceDialog />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)} className="mb-6">
          <TabsList className="bg-card border border-border/60 rounded-xl p-1 shadow-sm h-auto">
            <TabsTrigger
              value="tracking"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all"
            >
              <Clock className="size-3.5 mr-1.5" />
              {t('attendance.tabs.tracking')}
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all relative"
            >
              <ClipboardCheck className="size-3.5 mr-1.5" />
              {t('attendance.tabs.approvals')}
              {pendingApprovalsData?.meta?.total ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-amber-400 text-white rounded-full px-1">
                  {pendingApprovalsData.meta.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="breaks"
              className="data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all relative"
            >
              <Coffee className="size-3.5 mr-1.5" />
              {t('attendance.tabs.breaks')}
              {activeBreaks.length > 0 ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-orange-400 text-white rounded-full px-1">
                  {activeBreaks.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Daily Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">
            <TrackingTab
              stats={stats} entries={entries} geofenceViolations={geofenceViolations}
              filteredEntries={filteredEntries} loadingEntries={loadingEntries}
              loadingLocations={loadingLocations} isError={isError} error={error} refetch={refetch}
              meta={meta}
              selectedLocationId={selectedLocationId} setSelectedLocationId={setSelectedLocationId}
              selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus}
              selectedDate={selectedDate} setSelectedDate={setSelectedDate}
              endDate={endDate} setEndDate={setEndDate}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              page={page} setPage={setPage} limit={limit} daysOff={daysOff} locations={locations}
              schedulerInfo={schedulerInfo} triggerAutoClockOut={triggerAutoClockOut} isAdmin={isAdmin}
            />
          </TabsContent>

          {/* Approvals Tab */}
          <TabsContent value="approvals" className="mt-6">
            <ApprovalsTab
              loading={loadingApprovals}
              data={pendingApprovalsData}
              onRefresh={refetchApprovals}
              onApprove={(id) => approveEntry.mutate(id)}
              onReject={(id, reason) => rejectEntry.mutate({ entryId: id, reason })}
              approving={approveEntry.isPending}
              rejecting={rejectEntry.isPending}
            />
          </TabsContent>

          {/* Breaks Tab */}
          <TabsContent value="breaks" className="mt-6">
            <BreaksTab
              isAdmin={isAdmin}
              breakSummary={breakSummary}
              loadingBreakSummary={loadingBreakSummary}
              activeBreaks={activeBreaks}
              loadingActiveBreaks={loadingActiveBreaks}
              refetchActiveBreaks={refetchActiveBreaks}
              breakHistoryData={breakHistoryData}
              loadingBreakHistory={loadingBreakHistory}
              refetchBreakHistory={refetchBreakHistory}
              breakDate={breakDate}
              setBreakDate={setBreakDate}
              breakTypeFilter={breakTypeFilter}
              setBreakTypeFilter={setBreakTypeFilter}
              endBreakManually={endBreakManually}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
