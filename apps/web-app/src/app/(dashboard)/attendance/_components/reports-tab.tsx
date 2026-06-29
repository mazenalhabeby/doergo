"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  MapPin,
  Download,
  FileText,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Timer,
} from "lucide-react"
import { format, subWeeks, startOfWeek, endOfWeek, subMonths } from "date-fns"

import { attendanceApi, type AttendanceSummary, type CompanyLocation } from "@/lib/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportCSV as exportCSVFile, exportPDF, type ExportData } from "./export-utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// ============================================================================
// DATE RANGE PRESETS
// ============================================================================

type RangePreset = {
  label: string
  getRange: () => { type: "weekly" | "monthly"; weekStartDate?: string; year?: number; month?: number }
  getPeriodLabel: () => string
  getCompareLabel: () => string
}

const now = new Date()

const RANGE_PRESETS: RangePreset[] = [
  {
    label: "attendance.reports.thisWeek",
    getRange: () => ({ type: "weekly" }),
    getPeriodLabel: () => `${format(startOfWeek(now), "MMM d")} — ${format(endOfWeek(now), "MMM d, yyyy")}`,
    getCompareLabel: () => "vs last week",
  },
  {
    label: "attendance.reports.lastWeek",
    getRange: () => ({ type: "weekly", weekStartDate: format(startOfWeek(subWeeks(now, 1)), "yyyy-MM-dd") }),
    getPeriodLabel: () => {
      const s = startOfWeek(subWeeks(now, 1))
      return `${format(s, "MMM d")} — ${format(endOfWeek(s), "MMM d, yyyy")}`
    },
    getCompareLabel: () => "vs week before",
  },
  {
    label: "attendance.reports.thisMonth",
    getRange: () => ({ type: "monthly" }),
    getPeriodLabel: () => format(now, "MMMM yyyy"),
    getCompareLabel: () => "vs last month",
  },
  {
    label: "attendance.reports.lastMonth",
    getRange: () => {
      const d = subMonths(now, 1)
      return { type: "monthly", year: d.getFullYear(), month: d.getMonth() + 1 }
    },
    getPeriodLabel: () => format(subMonths(now, 1), "MMMM yyyy"),
    getCompareLabel: () => "vs month before",
  },
]

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

function KpiCard({
  label,
  value,
  unit,
  prevValue,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  unit?: string
  prevValue?: number
  icon: React.ElementType
  color: "blue" | "green" | "amber" | "red" | "slate"
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    green: { bg: "bg-green-50 dark:bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: "bg-green-500/15 text-green-600 dark:text-green-400" },
    amber: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    red: { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: "bg-red-500/15 text-red-600 dark:text-red-400" },
    slate: { bg: "bg-muted", text: "text-muted-foreground", icon: "bg-muted text-muted-foreground" },
  }
  const c = colorMap[color]

  // Trend calculation
  let trend: { pct: number; direction: "up" | "down" | "flat" } | null = null
  if (prevValue !== undefined && prevValue > 0) {
    const pct = Math.round(((value - prevValue) / prevValue) * 100)
    trend = { pct: Math.abs(pct), direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" }
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2.5 rounded-xl", c.icon)}>
          <Icon className="size-5" />
        </div>
        {trend && trend.direction !== "flat" && (
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
            trend.direction === "up" ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"
          )}>
            {trend.direction === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {trend.pct}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground">
        {value}{unit && <span className="text-lg text-muted-foreground ml-0.5">{unit}</span>}
      </p>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">{label}</p>
    </div>
  )
}

// ============================================================================
// HOURS BY TECHNICIAN CHART
// ============================================================================

// Color palette for each worker row
const BAR_COLORS = [
  { bar: "from-blue-500 to-blue-400", bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-200" },
  { bar: "from-violet-500 to-violet-400", bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-200" },
  { bar: "from-emerald-500 to-emerald-400", bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  { bar: "from-amber-500 to-amber-400", bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200" },
  { bar: "from-rose-500 to-rose-400", bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-200" },
  { bar: "from-cyan-500 to-cyan-400", bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-200" },
  { bar: "from-orange-500 to-orange-400", bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-200" },
  { bar: "from-indigo-500 to-indigo-400", bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-200" },
]

function HoursBarChart({ byUser, avgShift }: { byUser: AttendanceSummary["byUser"]; avgShift: number }) {
  const { t } = useTranslation()
  if (byUser.length === 0) return null

  const sorted = [...byUser].sort((a, b) => b.totalHours - a.totalHours)
  const maxHours = sorted[0]?.totalHours || 1

  return (
    <div className="space-y-3">
      {sorted.slice(0, 8).map((item, i) => {
        const pct = (item.totalHours / maxHours) * 100
        const color = BAR_COLORS[i % BAR_COLORS.length]!
        const hasIssues = item.autoClockOuts > 0

        return (
          <div
            key={item.user.id}
            className="group relative rounded-xl border border-transparent hover:border-border hover:bg-accent/50 p-2 -mx-2 transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              {/* Rank + Avatar */}
              <div className="w-36 flex-shrink-0 flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
                <div className={cn(
                  "size-8 rounded-lg flex items-center justify-center text-[10px] font-bold ring-1",
                  color.bg, color.text, color.ring
                )}>
                  {item.user.firstName.charAt(0)}{item.user.lastName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate leading-tight">
                    {item.user.firstName} {item.user.lastName.charAt(0)}.
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">
                    {t("attendance.reports.shiftCount", { count: item.shifts })}
                  </p>
                </div>
              </div>

              {/* Bar */}
              <div className="flex-1 relative">
                <div className="h-8 bg-muted rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      "h-full bg-gradient-to-r rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-2",
                      color.bar
                    )}
                    style={{ width: `${Math.max(pct, 5)}%` }}
                  >
                    {pct > 25 && (
                      <span className="text-[10px] font-bold text-white/90">
                        {item.totalHours}h
                      </span>
                    )}
                  </div>
                </div>
                {/* Average line indicator */}
                {avgShift > 0 && item.shifts > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-muted-foreground/40 hidden group-hover:block"
                    style={{ left: `${Math.min(((avgShift * item.shifts) / maxHours) * 100, 100)}%` }}
                    title={t("attendance.reports.expected", { hours: (avgShift * item.shifts).toFixed(1) })}
                  >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap bg-card px-1 rounded shadow-sm border border-border">
                      {t("attendance.reports.avgLabel")}
                    </div>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="w-20 flex-shrink-0 text-right space-y-0.5">
                <p className="text-sm font-bold text-foreground">{item.totalHours}h</p>
                <div className="flex items-center justify-end gap-1">
                  <span className="text-[10px] text-muted-foreground">{item.averageShiftHours}h avg</span>
                  {hasIssues && (
                    <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 text-[8px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 rounded-full">
                      {item.autoClockOuts}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {byUser.length > 8 && (
        <div className="text-center pt-2">
          <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {t("attendance.reports.moreWorkers", { count: byUser.length - 8 })}
          </span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN REPORTS TAB
// ============================================================================

interface ReportsTabProps {
  locations: CompanyLocation[]
  canAccess: boolean
}

export function ReportsTab({ locations, canAccess }: ReportsTabProps) {
  const { t } = useTranslation()
  const [selectedPreset, setSelectedPreset] = useState(0) // index into RANGE_PRESETS
  const [locationFilter, setLocationFilter] = useState("all")
  const [tableView, setTableView] = useState<"summary" | "location">("summary")

  // When a specific location is selected, always show worker view
  const activeView = locationFilter !== "all" ? "summary" : tableView

  const preset = RANGE_PRESETS[selectedPreset]!
  const rangeParams = preset.getRange()

  // Fetch current period report
  const { data: report, isLoading } = useQuery({
    queryKey: ["attendance-report", rangeParams],
    queryFn: () => {
      if (rangeParams.type === "weekly") {
        return attendanceApi.getWeeklyReport({ weekStartDate: rangeParams.weekStartDate })
      }
      return attendanceApi.getMonthlyReport({ year: rangeParams.year, month: rangeParams.month })
    },
    enabled: canAccess,
    staleTime: 30000,
  })

  // Fetch previous period for trend comparison
  const { data: prevReport } = useQuery({
    queryKey: ["attendance-report-prev", rangeParams],
    queryFn: () => {
      if (rangeParams.type === "weekly") {
        const prevStart = format(startOfWeek(subWeeks(
          rangeParams.weekStartDate ? new Date(rangeParams.weekStartDate) : now, 1
        )), "yyyy-MM-dd")
        return attendanceApi.getWeeklyReport({ weekStartDate: prevStart })
      }
      const prevDate = subMonths(
        rangeParams.year && rangeParams.month
          ? new Date(rangeParams.year, rangeParams.month - 1)
          : now,
        1
      )
      return attendanceApi.getMonthlyReport({ year: prevDate.getFullYear(), month: prevDate.getMonth() + 1 })
    },
    enabled: canAccess && !!report,
    staleTime: 60000,
  })

  // Org name for file naming
  const orgName = "HBCField"

  // Build export data with current filters applied
  const getExportData = (): ExportData => ({
    report: report!,
    filteredByUser,
    filteredByLocation,
    locationName: locationFilter !== "all"
      ? locations.find(l => l.id === locationFilter)?.name
      : undefined,
    orgName,
  })

  // Filter report data by location
  const filteredByUser = useMemo(() => {
    if (!report?.byUser) return []
    if (locationFilter === "all") return report.byUser
    const locName = locations.find(l => l.id === locationFilter)?.name
    if (!locName) return report.byUser
    return report.byUser.filter(u => u.locations.includes(locName))
  }, [report, locationFilter, locations])

  const filteredByLocation = useMemo(() => {
    if (!report?.byLocation) return []
    if (locationFilter === "all") return report.byLocation
    return report.byLocation.filter(l => l.location.id === locationFilter)
  }, [report, locationFilter])

  // Absence estimate: total workers - those who worked
  const absences = useMemo(() => {
    if (!report) return 0
    // rough: count users who have 0 shifts could be added; for now use autoClockOuts as proxy
    return report.summary.autoClockOuts
  }, [report])

  // Recalculate filtered totals
  const filteredTotalHours = filteredByUser.reduce((s, u) => s + u.totalHours, 0)
  const filteredShifts = filteredByUser.reduce((s, u) => s + u.shifts, 0)

  return (
    <div className="space-y-8">
      {/* ── Header Bar ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Period Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-border shadow-sm hover:shadow-md transition-all gap-2 font-medium"
                >
                  <CalendarDays className="size-4 text-blue-500" />
                  {t(preset.label)}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="start">
                {RANGE_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => setSelectedPreset(i)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all",
                      i === selectedPreset
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {t(p.label)}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Location */}
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px] h-10 rounded-xl border-border shadow-sm">
                <MapPin className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder={t("attendance.tracking.allLocations")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("attendance.tracking.allLocations")}</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period info */}
            {report && (
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-border ml-1">
                <span className="text-xs text-muted-foreground">
                  {preset.getPeriodLabel()} · {t("attendance.reports.workDaysCount", { count: report.period.workDays })}
                </span>
                {locationFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-semibold rounded-md">
                    <MapPin className="size-2.5" />
                    {locations.find(l => l.id === locationFilter)?.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={!report}
                className="h-10 px-4 rounded-xl border-border shadow-sm hover:shadow-md transition-all font-medium gap-2"
              >
                <Download className="size-4" />
                {t("attendance.reports.export")}
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => report && exportCSVFile(getExportData(), t)} className="gap-2.5 py-2.5">
                <FileText className="size-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium">CSV</p>
                  <p className="text-[10px] text-muted-foreground">{t("attendance.reports.spreadsheetData")}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => report && exportPDF(getExportData(), t)} className="gap-2.5 py-2.5">
                <FileText className="size-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">{t("attendance.reports.pdfReport")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("attendance.reports.printReady")}</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Loading / Empty ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : !report ? (
        <div className="bg-card rounded-2xl border border-dashed border-border p-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
            <FileText className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{t("attendance.reports.noDataTitle")}</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            {t("attendance.reports.noDataDesc")}
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Strip ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t("attendance.tracking.totalHours")} value={report.summary.totalHours} unit="h" prevValue={prevReport?.summary.totalHours} icon={Clock} color="blue" />
            <KpiCard label={t("attendance.reports.overtime")} value={report.summary.overtimeHours} unit="h" prevValue={prevReport?.summary.overtimeHours} icon={Timer} color={report.summary.overtimeHours > 0 ? "amber" : "slate"} />
            <KpiCard label={t("attendance.reports.autoClockOuts")} value={report.summary.autoClockOuts} prevValue={prevReport?.summary.autoClockOuts} icon={AlertTriangle} color={report.summary.autoClockOuts > 0 ? "red" : "slate"} />
            <KpiCard label={t("attendance.reports.avgShift")} value={report.summary.averageShiftHours} unit="h" prevValue={prevReport?.summary.averageShiftHours} icon={BarChart3} color="green" />
          </div>

          {/* ── Chart + Sidebar ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Chart */}
            <div className="lg:col-span-3 bg-card rounded-2xl border border-border/60 shadow-sm">
              <div className="px-6 pt-6 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("attendance.reports.hoursByWorker")}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("attendance.reports.chartSubtitle", { count: filteredByUser.length, hours: filteredTotalHours.toFixed(1) })}
                  </p>
                </div>
              </div>
              <div className="px-4 pb-5">
                {filteredByUser.length > 0 ? (
                  <HoursBarChart byUser={filteredByUser} avgShift={report.summary.averageShiftHours} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Users className="size-8 mb-2 text-muted-foreground" />
                    <p className="text-sm">{t("attendance.reports.noDataFilters")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="lg:col-span-2 bg-card rounded-2xl border border-border/60 shadow-sm p-6">
              <h3 className="text-sm font-bold text-foreground mb-5">{t("attendance.reports.overview")}</h3>
              <div className="space-y-0">
                {[
                  { label: t("attendance.reports.totalShifts"), value: report.summary.totalShifts, color: "" },
                  { label: t("attendance.reports.standardHours"), value: `${report.summary.standardHours}h`, color: "" },
                  { label: t("attendance.reports.overtimeHours"), value: `${report.summary.overtimeHours}h`, color: report.summary.overtimeHours > 0 ? "text-amber-600" : "" },
                  { label: t("attendance.breaks.activeNow"), value: report.summary.activeShifts, color: "text-emerald-600" },
                  { label: t("attendance.reports.workers"), value: filteredByUser.length, color: "" },
                  { label: t("attendance.reports.locations"), value: filteredByLocation.length, color: "" },
                ].map((stat, i) => (
                  <div key={stat.label} className={cn(
                    "flex items-center justify-between py-3.5",
                    i > 0 && "border-t border-border/80"
                  )}>
                    <span className="text-[13px] text-muted-foreground">{stat.label}</span>
                    <span className={cn("text-[13px] font-bold text-foreground", stat.color)}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Data Table ───────────────────────────────────────── */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            {/* Toggle + count */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              {locationFilter === "all" ? (
                <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                  {(["summary", "location"] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setTableView(view)}
                      className={cn(
                        "px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5",
                        activeView === view
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {view === "summary" ? <Users className="size-3.5" /> : <MapPin className="size-3.5" />}
                      {view === "summary" ? t("attendance.reports.byWorker") : t("attendance.reports.byLocation")}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10">
                    <Users className="size-3.5 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {t("attendance.reports.workersAt", { name: locations.find(l => l.id === locationFilter)?.name })}
                  </span>
                </div>
              )}
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                {t("attendance.reports.recordsCount", { count: activeView === "summary" ? filteredByUser.length : filteredByLocation.length })}
              </span>
            </div>

            {/* Worker rows */}
            {activeView === "summary" && (
              filteredByUser.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t("attendance.worker")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.hours")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.shifts")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.avg")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.issues")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t("attendance.reports.locations")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredByUser.map((item, i) => {
                      const color = BAR_COLORS[i % BAR_COLORS.length]!
                      return (
                        <TableRow key={item.user.id} className="hover:bg-accent/50 transition-colors">
                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn("size-9 rounded-lg flex items-center justify-center text-[10px] font-bold ring-1", color.bg, color.text, color.ring)}>
                                {item.user.firstName?.[0]}{item.user.lastName?.[0]}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{item.user.firstName} {item.user.lastName}</p>
                                <p className="text-[11px] text-muted-foreground">{item.user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-bold text-foreground">{item.totalHours}h</span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{item.shifts}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{item.averageShiftHours}h</TableCell>
                          <TableCell className="text-right">
                            {item.autoClockOuts > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 text-[10px] font-bold bg-red-500/10 text-red-600 rounded-full ring-1 ring-red-200">
                                {item.autoClockOuts}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {item.locations.map((loc) => (
                                <span key={loc} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded-md ring-1 ring-border/60">
                                  {loc}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {/* Totals row */}
                    <TableRow className="bg-muted border-t-2 border-border">
                      <TableCell className="py-3.5">
                        <span className="text-sm font-bold text-foreground">{t("attendance.reports.totalCount", { count: filteredByUser.length })}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-bold text-foreground">{filteredTotalHours.toFixed(1)}h</span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold text-foreground">{filteredShifts}</TableCell>
                      <TableCell className="text-right text-sm font-bold text-foreground">
                        {filteredShifts > 0 ? (filteredTotalHours / filteredShifts).toFixed(1) : "0"}h
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold text-foreground">
                        {filteredByUser.reduce((s, u) => s + u.autoClockOuts, 0) || "—"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="p-16 text-center">
                  <Users className="size-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">{t("attendance.reports.noWorkerData")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("attendance.reports.noWorkerDataDesc")}</p>
                </div>
              )
            )}

            {/* Location rows */}
            {activeView === "location" && (
              filteredByLocation.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t("attendance.reports.location")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.hours")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.shifts")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.workers")}</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider text-right">{t("attendance.reports.avgPerShift")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredByLocation.map((item, i) => {
                      const color = BAR_COLORS[i % BAR_COLORS.length]!
                      return (
                        <TableRow key={item.location.id} className="hover:bg-accent/50 transition-colors">
                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-lg ring-1", color.bg, color.text, color.ring)}>
                                <MapPin className="size-4" />
                              </div>
                              <span className="text-sm font-semibold text-foreground">{item.location.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold text-foreground">{item.totalHours}h</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{item.shifts}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{item.uniqueTechnicians}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {item.shifts > 0 ? (item.totalHours / item.shifts).toFixed(1) : "0"}h
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-16 text-center">
                  <MapPin className="size-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">{t("attendance.reports.noLocationData")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("attendance.reports.noLocationDataDesc")}</p>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
