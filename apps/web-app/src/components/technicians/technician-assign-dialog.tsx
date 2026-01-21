"use client"

import { useState, useMemo } from "react"
import {
  Star,
  MapPin,
  Clock,
  Briefcase,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { SuggestedTechnician } from "@/lib/api"

// =============================================================================
// TYPES
// =============================================================================

export interface TechnicianData extends SuggestedTechnician {
  avatarUrl?: string
}

interface TechnicianAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  technicians: TechnicianData[]
  isLoading?: boolean
  isAssigning?: boolean
  onAssign: (technicianId: string) => void
  suggestedTechnicianId?: string | null
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getTechnicianStatus(tech: TechnicianData): "Available" | "Busy" | "At Capacity" {
  if (tech.todayTaskCount >= tech.maxDailyJobs) return "At Capacity"
  if (tech.activeTaskCount > 0) return "Busy"
  return "Available"
}

function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "N/A"
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1)} km`
}

function formatAvailability(tech: TechnicianData): string {
  const remaining = tech.maxDailyJobs - tech.todayTaskCount
  if (remaining <= 0) return "At capacity"
  if (tech.activeTaskCount === 0) return "Available now"
  return `${remaining} slots left`
}

// =============================================================================
// FILTER OPTIONS
// =============================================================================

const DISTANCE_OPTIONS = [
  { value: "all", label: "Distance" },
  { value: "nearest", label: "Nearest" },
  { value: "5", label: "Within 5 km" },
  { value: "10", label: "Within 10 km" },
  { value: "20", label: "Within 20 km" },
]

const SPECIALIZATION_OPTIONS = [
  { value: "all", label: "Specialization" },
  { value: "electrical", label: "Electrical" },
  { value: "mechanical", label: "Mechanical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "general", label: "General" },
]

const AVAILABILITY_OPTIONS = [
  { value: "all", label: "Availability" },
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "capacity", label: "At Capacity" },
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TechnicianAssignDialog({
  open,
  onOpenChange,
  technicians,
  isLoading = false,
  isAssigning = false,
  onAssign,
  suggestedTechnicianId,
}: TechnicianAssignDialogProps) {
  const [searchName, setSearchName] = useState("")
  const [distanceFilter, setDistanceFilter] = useState("all")
  const [specializationFilter, setSpecializationFilter] = useState("all")
  const [availabilityFilter, setAvailabilityFilter] = useState("all")

  // Get suggested technician (highest score from backend)
  const suggestedTechnician = useMemo(() => {
    if (suggestedTechnicianId) {
      return technicians.find((t) => t.id === suggestedTechnicianId)
    }
    // Backend already sorts by score, first one is the best
    return technicians[0]
  }, [technicians, suggestedTechnicianId])

  // Filter technicians
  const filteredTechnicians = useMemo(() => {
    let filtered = technicians.filter((tech) => {
      // Name filter
      if (searchName) {
        const fullName = `${tech.firstName} ${tech.lastName}`.toLowerCase()
        if (!fullName.includes(searchName.toLowerCase())) return false
      }

      // Specialization filter
      if (specializationFilter !== "all") {
        if (!tech.specialty || tech.specialty.toLowerCase() !== specializationFilter) return false
      }

      // Distance filter
      if (distanceFilter !== "all" && distanceFilter !== "nearest") {
        const maxKm = parseFloat(distanceFilter)
        if (tech.distanceKm === null || tech.distanceKm > maxKm) return false
      }

      // Availability filter
      if (availabilityFilter !== "all") {
        const status = getTechnicianStatus(tech)
        if (availabilityFilter === "available" && status !== "Available") return false
        if (availabilityFilter === "busy" && status !== "Busy") return false
        if (availabilityFilter === "capacity" && status !== "At Capacity") return false
      }

      return true
    })

    // Sort by nearest if selected
    if (distanceFilter === "nearest") {
      filtered = [...filtered].sort((a, b) => {
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm
      })
    }

    return filtered
  }, [technicians, searchName, specializationFilter, distanceFilter, availabilityFilter])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Technicians
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Select a technician to handle this maintenance request.
          </DialogDescription>
        </DialogHeader>

        {/* Suggested Technician */}
        {suggestedTechnician && !isLoading && (
          <div className="mx-6 mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="size-10 border-2 border-white shadow-sm">
                    {suggestedTechnician.avatarUrl ? (
                      <AvatarImage src={suggestedTechnician.avatarUrl} />
                    ) : null}
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-medium text-sm">
                      {suggestedTechnician.firstName[0]}
                      {suggestedTechnician.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 bg-blue-600 rounded-full p-0.5">
                    <Sparkles className="size-2.5 text-white" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600 font-medium">
                      Best Match
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded-full cursor-help">
                            Score: {suggestedTechnician.score}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <div className="text-xs space-y-1">
                            <p className="font-medium mb-1">Score Breakdown:</p>
                            <p>Distance: {suggestedTechnician.scoreBreakdown.distance}% (30% weight)</p>
                            <p>Availability: {suggestedTechnician.scoreBreakdown.availability}% (25% weight)</p>
                            <p>Specialization: {suggestedTechnician.scoreBreakdown.specialization}% (20% weight)</p>
                            <p>Workload: {suggestedTechnician.scoreBreakdown.workload}% (15% weight)</p>
                            <p>Rating: {suggestedTechnician.scoreBreakdown.rating}% (10% weight)</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {suggestedTechnician.firstName} {suggestedTechnician.lastName}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs text-gray-600">{suggestedTechnician.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatAvailability(suggestedTechnician)}
                    {suggestedTechnician.distanceKm !== null && ` • ${formatDistance(suggestedTechnician.distanceKm)} away`}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-xs h-9 px-4 rounded-lg shadow-sm"
                onClick={() => onAssign(suggestedTechnician.id)}
                disabled={isAssigning || getTechnicianStatus(suggestedTechnician) === "At Capacity"}
              >
                {isAssigning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Assign Automatically"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 pb-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <Input
              placeholder="Name"
              className="pl-9 h-10 text-sm rounded-lg border-gray-200"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>
          <Select value={distanceFilter} onValueChange={setDistanceFilter}>
            <SelectTrigger className="w-[120px] h-10 text-sm rounded-lg border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTANCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={specializationFilter}
            onValueChange={setSpecializationFilter}
          >
            <SelectTrigger className="w-[140px] h-10 text-sm rounded-lg border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPECIALIZATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={availabilityFilter}
            onValueChange={setAvailabilityFilter}
          >
            <SelectTrigger className="w-[130px] h-10 text-sm rounded-lg border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Technician List */}
        <div className="border-t border-gray-100 max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredTechnicians.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredTechnicians.map((tech) => (
                <TechnicianRow
                  key={tech.id}
                  technician={tech}
                  isAssigning={isAssigning}
                  onAssign={onAssign}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">No technicians found</p>
              <p className="text-xs text-gray-400 mt-1">
                Try adjusting your filters
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// TECHNICIAN ROW
// =============================================================================

function TechnicianRow({
  technician,
  isAssigning,
  onAssign,
}: {
  technician: TechnicianData
  isAssigning: boolean
  onAssign: (id: string) => void
}) {
  const status = getTechnicianStatus(technician)
  const isAvailable = status === "Available"
  const isBusy = status === "Busy"
  const isAtCapacity = status === "At Capacity"

  return (
    <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <Avatar className="size-11 border-2 border-white shadow-sm">
          {technician.avatarUrl ? (
            <AvatarImage src={technician.avatarUrl} />
          ) : null}
          <AvatarFallback
            className={cn(
              "font-medium",
              isAvailable
                ? "bg-green-100 text-green-600"
                : isBusy
                  ? "bg-orange-100 text-orange-600"
                  : "bg-gray-100 text-gray-500"
            )}
          >
            {technician.firstName[0]}
            {technician.lastName[0]}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div>
          {/* Name + Rating + Score */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {technician.firstName} {technician.lastName}
            </span>
            <div className="flex items-center gap-0.5">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm text-gray-600">
                {technician.rating.toFixed(1)}
              </span>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded cursor-help">
                    {technician.score}%
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <p className="font-medium mb-1">Match Score Breakdown:</p>
                    <p>Distance: {technician.scoreBreakdown.distance}%</p>
                    <p>Availability: {technician.scoreBreakdown.availability}%</p>
                    <p>Specialization: {technician.scoreBreakdown.specialization}%</p>
                    <p>Workload: {technician.scoreBreakdown.workload}%</p>
                    <p>Rating: {technician.scoreBreakdown.rating}%</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Specialty */}
          <p className="text-sm text-gray-500">{technician.specialty || "General"}</p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1">
            {/* Status */}
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                isAvailable
                  ? "text-green-600"
                  : isBusy
                    ? "text-orange-600"
                    : "text-gray-400"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isAvailable
                    ? "bg-green-500"
                    : isBusy
                      ? "bg-orange-500"
                      : "bg-gray-300"
                )}
              />
              {status}
            </span>

            {/* Current Jobs */}
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Briefcase className="size-3" />
              {technician.activeTaskCount} Active
            </span>

            {/* Today's capacity */}
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="size-3" />
              {technician.todayTaskCount}/{technician.maxDailyJobs} today
            </span>

            {/* Distance */}
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <MapPin className="size-3" />
              {formatDistance(technician.distanceKm)}
            </span>
          </div>
        </div>
      </div>

      {/* Assign Button */}
      <Button
        size="sm"
        className={cn(
          "h-9 px-5 text-sm font-medium rounded-lg transition-colors",
          isAvailable
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : isBusy
              ? "bg-orange-500 hover:bg-orange-600 text-white"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
        )}
        onClick={() => onAssign(technician.id)}
        disabled={isAssigning || isAtCapacity}
      >
        Assign
      </Button>
    </div>
  )
}
