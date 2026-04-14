"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Users,
  Clock,
  AlertCircle,
  Umbrella,
  Check,
} from "lucide-react"
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns"

import { useAuth } from "@/contexts/auth-context"
import { techniciansApi, type TechnicianAvailability } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ViewMode = "month" | "week"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function TechniciansAvailabilityPage() {
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [selectedTechnician, setSelectedTechnician] = useState<string>("all")

  // Calculate days to display based on view mode
  const days = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(currentDate)
      const end = endOfWeek(currentDate)
      return eachDayOfInterval({ start, end })
    } else {
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      const startWeek = startOfWeek(start)
      const endWeek = endOfWeek(end)
      return eachDayOfInterval({ start: startWeek, end: endWeek })
    }
  }, [currentDate, viewMode])

  // Fetch availability for the entire date range in a single API call
  const startDateStr = format(days[0]!, "yyyy-MM-dd")
  const endDateStr = format(days[days.length - 1]!, "yyyy-MM-dd")

  const availabilityQueries = useQuery({
    queryKey: ["technicians-availability", startDateStr, endDateStr],
    queryFn: () => techniciansApi.getAvailabilityRange(startDateStr, endDateStr),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Build availability map by date
  const availabilityByDate = useMemo(() => {
    const map = new Map<string, TechnicianAvailability[]>()
    if (availabilityQueries.data) {
      for (const dayData of availabilityQueries.data) {
        map.set(dayData.date, dayData.technicians)
      }
    }
    return map
  }, [availabilityQueries.data])

  // Get unique technicians list for filter
  const allTechnicians = useMemo(() => {
    const techMap = new Map<string, { id: string; firstName: string; lastName: string }>()
    availabilityByDate.forEach(techs => {
      techs.forEach(t => {
        if (!techMap.has(t.id)) {
          techMap.set(t.id, { id: t.id, firstName: t.firstName, lastName: t.lastName })
        }
      })
    })
    return Array.from(techMap.values())
  }, [availabilityByDate])

  // Get today's summary
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    const todayData = availabilityByDate.get(todayStr)
    if (!todayData) {
      return { total: 0, available: 0, onTimeOff: 0 }
    }
    const scheduled = todayData.filter(t => t.schedule || t.onTimeOff)
    return {
      total: scheduled.length,
      available: scheduled.filter(t => t.isAvailable).length,
      onTimeOff: scheduled.filter(t => t.onTimeOff).length,
    }
  }, [availabilityByDate])

  // Navigation handlers
  const handlePrevious = () => {
    if (viewMode === "week") {
      setCurrentDate(subWeeks(currentDate, 1))
    } else {
      setCurrentDate(subMonths(currentDate, 1))
    }
  }

  const handleNext = () => {
    if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1))
    } else {
      setCurrentDate(addMonths(currentDate, 1))
    }
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Get header title
  const headerTitle = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(currentDate)
      const end = endOfWeek(currentDate)
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`
      }
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
    }
    return format(currentDate, "MMMM yyyy")
  }, [currentDate, viewMode])

  // Check permissions
  if (user?.role !== "ADMIN" && user?.role !== "DISPATCHER") {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Link href="/technicians">
            <Button variant="ghost" size="sm" className="gap-2 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
              Back to Technicians
            </Button>
          </Link>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              Access Denied
            </h3>
            <p className="text-sm text-slate-500">
              You don&apos;t have permission to view technician availability.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const isInitialLoad = availabilityQueries.isLoading
  const isFetchingNew = availabilityQueries.isFetching && !availabilityQueries.isLoading

  return (
    <TooltipProvider>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Link href="/technicians">
                  <Button variant="ghost" size="sm" className="gap-2 rounded-lg hover:bg-white/80">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </Link>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                    Technician Availability
                  </h1>
                  <p className="mt-1.5 text-slate-500">
                    View schedules and time-off across all technicians
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* View Mode */}
                <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                  <SelectTrigger className="w-[120px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>

                {/* Technician Filter */}
                <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                  <SelectTrigger className="w-[180px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                    <SelectValue placeholder="All technicians" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Technicians</SelectItem>
                    {allTechnicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.firstName} {tech.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Navigation */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToday}
                  className="h-11 px-4 rounded-xl bg-white/80 backdrop-blur-sm border-slate-200/80 shadow-sm hover:shadow-md transition-all"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevious}
                  className="h-11 w-11 rounded-xl bg-white/80 backdrop-blur-sm border-slate-200/80 shadow-sm hover:shadow-md transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold text-slate-700 min-w-36 text-center">
                  {headerTitle}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNext}
                  className="h-11 w-11 rounded-xl bg-white/80 backdrop-blur-sm border-slate-200/80 shadow-sm hover:shadow-md transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Technicians</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {todaySummary.total}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-green-100 flex items-center justify-center">
                  <Check className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Available Today</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {todaySummary.available}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Umbrella className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">On Time-Off Today</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {todaySummary.onTimeOff}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className={cn(
            "bg-white rounded-2xl border border-slate-200/60 shadow-md overflow-hidden mb-6 transition-all duration-300",
            isFetchingNew && "opacity-50 pointer-events-none"
          )}>
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {WEEKDAYS.map((day, i) => (
                <div
                  key={day}
                  className={cn(
                    "text-center text-xs font-semibold uppercase tracking-wider py-3.5",
                    i === 0 || i === 6 ? "text-slate-400" : "text-slate-500"
                  )}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            {isInitialLoad ? (
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="min-h-44 bg-white p-3 border-r border-slate-50 last:border-r-0">
                    <Skeleton className="h-7 w-7 rounded-full mb-4" />
                    <div className="space-y-2">
                      <Skeleton className="h-9 w-full rounded-xl" />
                      <Skeleton className="h-9 w-full rounded-xl" />
                      <Skeleton className="h-9 w-4/5 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-7">
              {days.map((day, dayIndex) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isTodayDate = isToday(day)
                const dayTechnicians = availabilityByDate.get(dateStr) || []

                // Only show technicians who have a schedule or are on time-off (skip unscheduled)
                const relevantTechnicians = dayTechnicians.filter(t => t.schedule || t.onTimeOff)

                // Filter by selected technician
                const filteredTechnicians = selectedTechnician === "all"
                  ? relevantTechnicians
                  : relevantTechnicians.filter(t => t.id === selectedTechnician)

                const availableCount = filteredTechnicians.filter(t => t.isAvailable).length
                const onTimeOffCount = filteredTechnicians.filter(t => t.onTimeOff).length

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-44 p-3 transition-all duration-150 border-r border-slate-50 last:border-r-0",
                      !isCurrentMonth && "bg-slate-25",
                      isTodayDate
                        ? "bg-blue-50/40 ring-1 ring-inset ring-blue-200/50"
                        : "hover:bg-slate-50/50"
                    )}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold leading-none",
                            !isCurrentMonth && "text-slate-300",
                            isCurrentMonth && !isTodayDate && "text-slate-800",
                            isTodayDate &&
                              "bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-sm"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {isTodayDate && (
                          <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Today</span>
                        )}
                      </div>
                      {filteredTechnicians.length > 0 && (
                        <div className="flex items-center gap-1">
                          {availableCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1">
                              {availableCount}
                            </span>
                          )}
                          {onTimeOffCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-400 text-white text-[10px] font-bold px-1">
                              {onTimeOffCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Technician Cards */}
                    <div className="space-y-1.5">
                      {viewMode === "week" ? (
                        filteredTechnicians.slice(0, 5).map((tech) => (
                          <Tooltip key={tech.id}>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/technicians/${tech.id}`}
                                className="block group"
                              >
                                <div
                                  className={cn(
                                    "flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-150",
                                    "group-hover:shadow-sm group-hover:scale-[1.02]",
                                    tech.onTimeOff
                                      ? "bg-amber-50 border border-amber-200/60"
                                      : tech.isAvailable
                                      ? "bg-emerald-50 border border-emerald-200/60"
                                      : "bg-slate-50 border border-slate-200/60"
                                  )}
                                >
                                  {/* Avatar circle */}
                                  <div
                                    className={cn(
                                      "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                                      tech.onTimeOff
                                        ? "bg-amber-400 text-white"
                                        : tech.isAvailable
                                        ? "bg-emerald-500 text-white"
                                        : "bg-slate-300 text-white"
                                    )}
                                  >
                                    {tech.firstName.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-slate-700 truncate leading-tight">
                                      {tech.firstName} {tech.lastName.charAt(0)}.
                                    </p>
                                    <p className={cn(
                                      "text-[9px] leading-tight truncate",
                                      tech.onTimeOff
                                        ? "text-amber-600"
                                        : tech.isAvailable
                                        ? "text-emerald-600"
                                        : "text-slate-400"
                                    )}>
                                      {tech.onTimeOff
                                        ? "Time Off"
                                        : tech.schedule
                                        ? `${tech.schedule.startTime} - ${tech.schedule.endTime}`
                                        : "No schedule"}
                                    </p>
                                  </div>
                                </div>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold">{tech.firstName} {tech.lastName}</p>
                                {tech.onTimeOff ? (
                                  <div className="flex items-center gap-1.5 text-amber-600">
                                    <Umbrella className="h-3.5 w-3.5" />
                                    <span className="text-xs">{tech.timeOff?.reason || "Time off"}</span>
                                  </div>
                                ) : tech.schedule ? (
                                  <div className="flex items-center gap-1.5 text-emerald-600">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="text-xs">
                                      {tech.schedule.startTime} - {tech.schedule.endTime}
                                      {tech.schedule.notes && ` · ${tech.schedule.notes}`}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-slate-400">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="text-xs">Not scheduled</span>
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))
                      ) : (
                        // Compact view for month mode
                        <div className="flex flex-wrap gap-1.5">
                          {filteredTechnicians.slice(0, 6).map((tech) => (
                            <Tooltip key={tech.id}>
                              <TooltipTrigger>
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold cursor-pointer",
                                    "transition-all duration-150 hover:scale-110 hover:shadow-sm",
                                    tech.onTimeOff
                                      ? "bg-amber-400 text-white"
                                      : tech.isAvailable
                                      ? "bg-emerald-500 text-white"
                                      : "bg-slate-300 text-white"
                                  )}
                                >
                                  {tech.firstName.charAt(0)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-medium">
                                  {tech.firstName} {tech.lastName}
                                </p>
                                {tech.onTimeOff ? (
                                  <p className="text-xs text-amber-600">Time off</p>
                                ) : tech.schedule ? (
                                  <p className="text-xs text-emerald-600">
                                    {tech.schedule.startTime} - {tech.schedule.endTime}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400">Not scheduled</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {filteredTechnicians.length > 6 && (
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-medium flex items-center justify-center">
                              +{filteredTechnicians.length - 6}
                            </span>
                          )}
                        </div>
                      )}
                      {viewMode === "week" && filteredTechnicians.length > 5 && (
                        <p className="text-[10px] text-slate-400 font-medium pl-1 pt-0.5">
                          +{filteredTechnicians.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>

          {/* Legend — inline in a subtle bar */}
          <div className="flex items-center justify-center gap-8 text-xs text-slate-500 py-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Time Off</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span>Not Scheduled</span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
