"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
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

  // Fetch availability for each day
  const availabilityQueries = useQuery({
    queryKey: ["technicians-availability", days.map(d => format(d, "yyyy-MM-dd"))],
    queryFn: async () => {
      // Fetch availability for all days in parallel
      const results = await Promise.all(
        days.map(day => techniciansApi.getAvailability(format(day, "yyyy-MM-dd")))
      )
      return results
    },
    staleTime: 30000, // Cache for 30 seconds
  })

  // Build availability map by date
  const availabilityByDate = useMemo(() => {
    const map = new Map<string, TechnicianAvailability[]>()
    if (availabilityQueries.data) {
      days.forEach((day, index) => {
        const dateStr = format(day, "yyyy-MM-dd")
        const response = availabilityQueries.data[index]
        if (response) {
          map.set(dateStr, response.technicians)
        }
      })
    }
    return map
  }, [availabilityQueries.data, days])

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
    return {
      total: todayData.length,
      available: todayData.filter(t => t.isAvailable).length,
      onTimeOff: todayData.filter(t => t.onTimeOff).length,
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
        return format(start, "MMMM yyyy")
      }
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
    }
    return format(currentDate, "MMMM yyyy")
  }, [currentDate, viewMode])

  // Check permissions
  if (user?.role !== "ADMIN" && user?.role !== "DISPATCHER") {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/technicians">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Technicians
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              Access Denied
            </h3>
            <p className="text-sm text-slate-500">
              You don&apos;t have permission to view technician availability.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (availabilityQueries.isLoading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/technicians">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="h-6 w-6" />
                Technician Availability
              </h1>
              <p className="text-sm text-slate-500">
                View schedules and time-off across all technicians
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* View Mode & Technician Filter */}
              <div className="flex items-center gap-4">
                <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                  <SelectTrigger className="w-48">
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
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={handlePrevious}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-slate-700 min-w-32 text-center">
                  {headerTitle}
                </span>
                <Button variant="outline" size="icon" onClick={handleNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="pt-6">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 pb-2 mb-2">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-medium text-slate-500 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-px bg-slate-200">
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isTodayDate = isToday(day)
                const dayTechnicians = availabilityByDate.get(dateStr) || []

                // Filter by selected technician
                const filteredTechnicians = selectedTechnician === "all"
                  ? dayTechnicians
                  : dayTechnicians.filter(t => t.id === selectedTechnician)

                const availableCount = filteredTechnicians.filter(t => t.isAvailable).length
                const onTimeOffCount = filteredTechnicians.filter(t => t.onTimeOff).length
                const notScheduledCount = filteredTechnicians.filter(t => !t.schedule && !t.onTimeOff).length

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-24 bg-white p-2",
                      viewMode === "week" && "min-h-32",
                      !isCurrentMonth && "bg-slate-50"
                    )}
                  >
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={cn(
                          "text-sm",
                          !isCurrentMonth && "text-slate-400",
                          isTodayDate &&
                            "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {filteredTechnicians.length > 0 && (
                        <div className="flex items-center gap-1">
                          {availableCount > 0 && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              {availableCount}
                            </Badge>
                          )}
                          {onTimeOffCount > 0 && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              {onTimeOffCount}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Technician Indicators */}
                    <div className="space-y-1">
                      {viewMode === "week" ? (
                        // Detailed view for week mode
                        filteredTechnicians.slice(0, 4).map((tech) => (
                          <Tooltip key={tech.id}>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/technicians/${tech.id}`}
                                className="block"
                              >
                                <div
                                  className={cn(
                                    "text-xs px-2 py-1 rounded truncate hover:opacity-80 transition-opacity flex items-center gap-1",
                                    tech.onTimeOff
                                      ? "bg-amber-100 text-amber-700"
                                      : tech.isAvailable
                                      ? "bg-green-100 text-green-700"
                                      : "bg-slate-100 text-slate-500"
                                  )}
                                >
                                  {tech.onTimeOff ? (
                                    <Umbrella className="h-3 w-3" />
                                  ) : tech.isAvailable ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Clock className="h-3 w-3" />
                                  )}
                                  {tech.firstName} {tech.lastName.charAt(0)}.
                                </div>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <p className="font-medium">{tech.firstName} {tech.lastName}</p>
                                {tech.onTimeOff ? (
                                  <p className="text-amber-600">
                                    Time off: {tech.timeOff?.reason || "No reason given"}
                                  </p>
                                ) : tech.schedule ? (
                                  <p className="text-green-600">
                                    {tech.schedule.startTime} - {tech.schedule.endTime}
                                    {tech.schedule.notes && ` (${tech.schedule.notes})`}
                                  </p>
                                ) : (
                                  <p className="text-slate-500">Not scheduled</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))
                      ) : (
                        // Compact view for month mode
                        <div className="flex flex-wrap gap-1">
                          {filteredTechnicians.slice(0, 5).map((tech) => (
                            <Tooltip key={tech.id}>
                              <TooltipTrigger>
                                <div
                                  className={cn(
                                    "w-2 h-2 rounded-full cursor-pointer",
                                    tech.onTimeOff
                                      ? "bg-amber-400"
                                      : tech.isAvailable
                                      ? "bg-green-500"
                                      : "bg-slate-300"
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-medium">
                                  {tech.firstName} {tech.lastName}
                                </p>
                                {tech.onTimeOff ? (
                                  <p className="text-xs text-amber-600">Time off</p>
                                ) : tech.schedule ? (
                                  <p className="text-xs text-green-600">
                                    {tech.schedule.startTime} - {tech.schedule.endTime}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-500">Not scheduled</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {filteredTechnicians.length > 5 && (
                            <span className="text-xs text-slate-400">
                              +{filteredTechnicians.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                      {viewMode === "week" && filteredTechnicians.length > 4 && (
                        <div className="text-xs text-slate-400 px-2">
                          +{filteredTechnicians.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Technicians</p>
                  <p className="text-2xl font-semibold text-slate-800">
                    {todaySummary.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Available Today</p>
                  <p className="text-2xl font-semibold text-slate-800">
                    {todaySummary.available}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Umbrella className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">On Time-Off Today</p>
                  <p className="text-2xl font-semibold text-slate-800">
                    {todaySummary.onTimeOff}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Legend */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-slate-600">Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-slate-600">Time Off</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="text-slate-600">Not Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                  1
                </div>
                <span className="text-slate-600">Today</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
