import React from "react"
import type { PaginationMeta } from "@/lib/api"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns"
import { cn, formatDurationMinutes } from "@/lib/utils"
import { type TimeEntry, type CompanyLocation } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, CheckCircle2, Clock, MapPin, RefreshCw, Search, Calendar, Users, ArrowRight, CalendarOff, ArrowUp, ArrowDown, ChevronsUpDown, ChevronRight, ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { useTranslation } from "react-i18next"
import { StatCard, toDate, formatTime, formatDateInZone, StatusBadge, WorkerCell, ClockCell, ApprovalCell, NoteCell } from "./attendance-helpers"
import { countryFromTz } from "@hbcfield/shared/client"
import { EditEntryDialog } from "./edit-entry-dialog"
import { EditDayOffDialog } from "./edit-dayoff-dialog"
import { OutOfRingPanel } from "./out-of-ring-panel"
import { useTimeFormat } from "@/hooks"

// Approved time-off shown inline as a "day off" row in the tracking table.
export type DayOffRow = {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  technician?: { id: string; firstName: string; lastName: string } | null
}

interface TrackingTabProps {
  stats: { active: number; completed: number; autoOut: number; totalHours: number }
  entries: TimeEntry[]
  geofenceViolations: TimeEntry[]
  filteredEntries: TimeEntry[]
  loadingEntries: boolean
  loadingLocations: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  meta?: PaginationMeta
  selectedLocationId: string
  setSelectedLocationId: (v: string) => void
  selectedStatus: string
  setSelectedStatus: (v: string) => void
  selectedDate: string
  setSelectedDate: (v: string) => void
  endDate: string
  setEndDate: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  limit: number
  daysOff: DayOffRow[]
  locations: CompanyLocation[]
  isAdmin: boolean
  sort: { key: string; dir: "asc" | "desc" } | null
  onSort: (key: string) => void
}

export function TrackingTab({
  stats, entries, geofenceViolations, filteredEntries, loadingEntries, loadingLocations,
  isError, error, refetch, meta,
  selectedLocationId, setSelectedLocationId, selectedStatus, setSelectedStatus,
  selectedDate, setSelectedDate, endDate, setEndDate, searchQuery, setSearchQuery,
  page, setPage, limit, daysOff, locations, isAdmin,
  sort, onSort,
}: TrackingTabProps) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()

  // Days off (org-wide) only load in the "all" view. They get their own sub-tab
  // so the Clock In / Clock Out columns aren't shown for rows that never have
  // clock times — the attendance table stays pure clock entries.
  const showDaysOffTab = selectedLocationId === "all"
  const [view, setView] = React.useState<"attendance" | "daysoff">("attendance")
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const effectiveView: "attendance" | "daysoff" = showDaysOffTab ? view : "attendance"

  // Quick date-range presets (computed once on mount).
  const presets = React.useMemo(() => {
    const now = new Date()
    const f = (d: Date) => format(d, "yyyy-MM-dd")
    return [
      { key: "today", from: f(now), to: f(now) },
      { key: "last7", from: f(subDays(now, 6)), to: f(now) },
      { key: "thisWeek", from: f(startOfWeek(now, { weekStartsOn: 1 })), to: f(endOfWeek(now, { weekStartsOn: 1 })) },
      { key: "thisMonth", from: f(startOfMonth(now)), to: f(endOfMonth(now)) },
    ]
  }, [])

  const applyRange = (from: string, to: string) => {
    setSelectedDate(from)
    setEndDate(to)
    setPage(1)
  }

  return (
    <>

        {/* Stats Cards — only show when there's data */}
        {entries.length > 0 && (
          <div data-tour="tracking-stats" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              title={t("attendance.tracking.currentlyActive")}
              value={stats.active}
              icon={Users}
              color="green"
            />
            <StatCard
              title={t("attendance.tracking.completedShifts")}
              value={stats.completed}
              icon={CheckCircle2}
              color="blue"
            />
            <StatCard
              title={t("attendance.tracking.autoClockOut")}
              value={stats.autoOut}
              icon={AlertCircle}
              color="amber"
            />
            <StatCard
              title={t("attendance.tracking.totalHours")}
              value={`${stats.totalHours}h`}
              icon={Clock}
              color="slate"
            />
          </div>
        )}

        {/* Out-of-Ring approver panel (geofence excursions) */}
        <OutOfRingPanel canApprove={isAdmin} />

        {/* Geofence Alerts Section */}
        {geofenceViolations.length > 0 && (
          <div className="bg-card rounded-2xl border border-amber-200/60 dark:border-amber-500/25 shadow-sm mb-8 overflow-hidden">
            <div className="p-5 border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
                    {t("attendance.tracking.geofenceAlerts", { count: geofenceViolations.length })}
                  </h2>
                  <p className="text-sm text-amber-700 dark:text-amber-300/80">
                    {t("attendance.tracking.geofenceAlertsDesc")}
                  </p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-500/15">
              {geofenceViolations.slice(0, 5).map((entry: TimeEntry) => (
                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      firstName={entry.user?.firstName}
                      lastName={entry.user?.lastName}

                      seed={entry.user?.id}
                      size="md"
                    />
                    <div>
                      <p className="font-medium text-foreground">
                        {entry.user?.firstName} {entry.user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.location?.name || t("attendance.unknownLocation")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {(() => {
                      const tz = entry.timezone ?? entry.location?.timezone
                      const country = countryFromTz(tz, locale)
                      return (
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground tabular-nums">
                            {formatTime(entry.clockInAt, hour12, locale, tz)}
                            {entry.clockOutAt && ` – ${formatTime(entry.clockOutAt, hour12, locale, tz)}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateInZone(entry.clockInAt, tz, locale)}
                            {country ? ` · ${country}` : ""}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 justify-end">
                            {!entry.clockInWithinGeofence && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <MapPin className="size-3" />
                                {t("attendance.tracking.clockInOutside")}
                              </span>
                            )}
                            {entry.clockOutAt && entry.clockOutWithinGeofence === false && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <MapPin className="size-3" />
                                {t("attendance.tracking.clockOutOutside")}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
              ))}
              {geofenceViolations.length > 5 && (
                <div className="p-3 text-center text-sm text-amber-600">
                  {t("attendance.tracking.moreAlerts", { count: geofenceViolations.length - 5 })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div data-tour="tracking-filters" className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("attendance.tracking.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm"
            />
          </div>

          {/* Location Filter */}
          <Select
            value={selectedLocationId}
            onValueChange={(value) => {
              setSelectedLocationId(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[200px] h-11 rounded-xl bg-card border-border/80 shadow-sm">
              <MapPin className="size-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder={t("attendance.tracking.selectLocation")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("attendance.tracking.allLocations")}</SelectItem>
              {locations.map((location: CompanyLocation) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={selectedStatus}
            onValueChange={(value) => {
              setSelectedStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[150px] h-11 rounded-xl bg-card border-border/80 shadow-sm">
              <SelectValue placeholder={t("attendance.tracking.statusPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="CLOCKED_IN">{t("attendance.status.active")}</SelectItem>
              <SelectItem value="CLOCKED_OUT">{t("attendance.status.completed")}</SelectItem>
              <SelectItem value="AUTO_OUT">{t("attendance.tracking.autoClockOut")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range — unified From → To pill */}
          <div className="group inline-flex items-center h-11 gap-1 rounded-xl border border-border/80 bg-card/80 px-3 shadow-sm transition-colors focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-foreground/10">
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <Input
              type="date"
              aria-label={t("attendance.tracking.fromDate")}
              title={t("attendance.tracking.fromDate")}
              value={selectedDate}
              max={endDate || undefined}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setPage(1)
              }}
              className="h-9 w-[124px] border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            <Input
              type="date"
              aria-label={t("attendance.tracking.toDate")}
              title={t("attendance.tracking.toDate")}
              value={endDate}
              min={selectedDate || undefined}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="h-9 w-[124px] border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            className="h-11 w-11 rounded-xl border-border/80 bg-card shadow-sm hover:bg-accent"
          >
            <RefreshCw className="size-4 text-muted-foreground" />
          </Button>

          {/* Quick range presets */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1 shadow-sm">
            {presets.map((p) => {
              const active = selectedDate === p.from && endDate === p.to
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyRange(p.from, p.to)}
                  className={cn(
                    "h-9 rounded-lg px-3 text-xs font-medium transition-all",
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  )}
                >
                  {t(`attendance.tracking.presets.${p.key}`)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Attendance vs Days-off sub-tabs (days off are org-wide → "all" view only) */}
        {showDaysOffTab && (
          <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setView("attendance")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-all",
                effectiveView === "attendance" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Clock className="size-4" />
              {t("attendance.tabs.attendance", "Attendance")}
            </button>
            <button
              type="button"
              onClick={() => setView("daysoff")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-all",
                effectiveView === "daysoff" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarOff className="size-4" />
              {t("attendance.tabs.daysOff", "Days off")}
              {daysOff.length > 0 && (
                <span className={cn("ml-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", effectiveView === "daysoff" ? "bg-background/20" : "bg-foreground/10")}>
                  {daysOff.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Table */}
        <div data-tour="tracking-table" className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          {loadingEntries || loadingLocations ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="size-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">
                {t("attendance.tracking.failedToLoad")}
              </h3>
              <p className="text-muted-foreground mt-1">
                {error instanceof Error ? error.message : t("attendance.tracking.errorOccurred")}
              </p>
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="mt-4"
              >
                <RefreshCw className="size-4 mr-2" />
                {t("common.retry")}
              </Button>
            </div>
          ) : effectiveView === "daysoff" ? (
            daysOff.length === 0 ? (
              <div className="p-12 text-center">
                <CalendarOff className="size-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">{t("attendance.daysOff.none", "No days off in this range")}</h3>
                <p className="text-muted-foreground mt-1">{t("attendance.daysOff.noneHint", "Approved time off for the selected dates shows here.")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-semibold text-muted-foreground">{t("attendance.worker")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("attendance.daysOff.type", "Type")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("attendance.daysOff.dates", "Dates")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("common.duration")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("attendance.approval")}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t("attendance.notes")}</TableHead>
                    {isAdmin && <TableHead className="w-10 text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daysOff.map((off) => {
                    const rs = toDate(off.startDate)
                    const re = toDate(off.endDate)
                    const single = format(rs, "yyyy-MM-dd") === format(re, "yyyy-MM-dd")
                    const days = Math.max(1, Math.round((re.getTime() - rs.getTime()) / 86_400_000) + 1)
                    return (
                      <TableRow key={`off-${off.id}`} className="hover:bg-violet-500/10">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar firstName={off.technician?.firstName} lastName={off.technician?.lastName} seed={off.technician?.id} size="md" />
                            <p className="font-medium text-foreground">
                              {off.technician?.firstName} {off.technician?.lastName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-300">
                            <CalendarOff className="size-3.5" />
                            {t("attendance.dayOff.label")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground">
                            {single ? format(rs, "MMM d") : `${format(rs, "MMM d")} – ${format(re, "MMM d")}`}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {days} {days === 1 ? t("attendance.dayOff.day") : t("attendance.dayOff.days")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                            <CheckCircle2 className="size-3.5" />
                            {t("common.approved")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <NoteCell note={off.reason} />
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <EditDayOffDialog dayOff={off} />
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="size-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">
                {t("attendance.tracking.noRecords")}
              </h3>
              <p className="text-muted-foreground mt-1">
                {selectedLocationId === "all"
                  ? t("attendance.tracking.selectLocationHint")
                  : t("attendance.tracking.noEntriesHint")}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <SortHead label={t("attendance.worker")} active={sort?.key === "worker"} dir={sort?.dir ?? "asc"} onClick={() => onSort("worker")} />
                    <SortHead label={t("common.status")} active={sort?.key === "status"} dir={sort?.dir ?? "asc"} onClick={() => onSort("status")} />
                    <SortHead label={t("attendance.clockIn")} active={sort?.key === "clockIn"} dir={sort?.dir ?? "asc"} onClick={() => onSort("clockIn")} />
                    <SortHead label={t("attendance.clockOut")} active={sort?.key === "clockOut"} dir={sort?.dir ?? "asc"} onClick={() => onSort("clockOut")} />
                    <SortHead label={t("common.duration")} active={sort?.key === "duration"} dir={sort?.dir ?? "asc"} onClick={() => onSort("duration")} />
                    <SortHead label={t("attendance.approval")} active={sort?.key === "approval"} dir={sort?.dir ?? "asc"} onClick={() => onSort("approval")} />
                    <TableHead className="font-semibold text-muted-foreground">{t("worklog.column", "Activity")}</TableHead>
                    {isAdmin && <TableHead className="w-10 text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: TimeEntry) => {
                    const isOpen = expandedId === entry.id
                    return (
                    <React.Fragment key={entry.id}>
                    <TableRow className="cursor-pointer hover:bg-accent/50" onClick={() => setExpandedId(isOpen ? null : entry.id)}>
                      <TableCell>
                        <WorkerCell entry={entry} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                      <TableCell>
                        <ClockCell at={entry.clockInAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <ClockCell at={entry.clockOutAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {formatDurationMinutes(entry.totalMinutes)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ApprovalCell entry={entry} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ListChecks className="h-4 w-4 shrink-0" />
                          <span>{t("worklog.view", "View")}</span>
                          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <EditEntryDialog entry={entry} />
                        </TableCell>
                      )}
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={isAdmin ? 8 : 7} className="p-4">
                          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <ListChecks className="h-3.5 w-3.5" /> {t("worklog.title", "Activity — what they did")}
                          </div>
                          {/* Managers/admins can add & edit a member's activity (with photos). */}
                          <WorkLogTimeline entryId={entry.id} editable={isAdmin} memberName={`${entry.user?.firstName ?? ""} ${entry.user?.lastName ?? ""}`.trim() || undefined} clockOutNote={entry.notes} />
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    {t("attendance.tracking.showingEntries", {
                      start: (page - 1) * limit + 1,
                      end: Math.min(page * limit, meta.total),
                      total: meta.total,
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                      disabled={page === meta.totalPages}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </>
  )
}

// Sortable column header — click to cycle asc → desc → off.
function SortHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className="font-semibold text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  )
}
