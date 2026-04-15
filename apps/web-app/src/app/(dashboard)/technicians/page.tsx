"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
  Filter,
  Star,
  MapPin,
  Clock,
  MoreHorizontal,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
} from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import {
  techniciansApi,
  type TechnicianListItem,
  type TechniciansQueryParams,
  TechnicianType,
  WorkMode,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

// Status filter options
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
] as const

// Type filter options
const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: TechnicianType.FULL_TIME, label: "Full-Time" },
  { value: TechnicianType.FREELANCER, label: "Freelancer" },
] as const

// Work mode filter options
const WORK_MODE_OPTIONS = [
  { value: "all", label: "All Modes" },
  { value: WorkMode.ON_SITE, label: "On-Site" },
  { value: WorkMode.ON_ROAD, label: "On-Road" },
  { value: WorkMode.HYBRID, label: "Hybrid" },
] as const

// Specialty filter options
const SPECIALTY_OPTIONS = [
  { value: "all", label: "All Specialties" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
] as const

export default function TechniciansPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active")
  const [typeFilter, setTypeFilter] = useState<TechnicianType | "all">("all")
  const [workModeFilter, setWorkModeFilter] = useState<WorkMode | "all">("all")
  const [specialtyFilter, setSpecialtyFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Deactivate dialog state
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianListItem | null>(null)

  // Build query params
  const queryParams: TechniciansQueryParams = useMemo(() => ({
    status: statusFilter,
    type: typeFilter,
    workMode: workModeFilter,
    specialty: specialtyFilter !== "all" ? specialtyFilter : undefined,
    search: searchQuery || undefined,
    page,
    limit,
  }), [statusFilter, typeFilter, workModeFilter, specialtyFilter, searchQuery, page, limit])

  // Fetch technicians
  const { data: techniciansData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["technicians", queryParams],
    queryFn: () => techniciansApi.list(queryParams),
  })

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => techniciansApi.deactivate(id),
    onSuccess: () => {
      toast.success("Technician deactivated successfully")
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
      setDeactivateDialogOpen(false)
      setSelectedTechnician(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to deactivate technician")
    },
  })

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => techniciansApi.update(id, { isActive: true }),
    onSuccess: () => {
      toast.success("Technician reactivated successfully")
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reactivate technician")
    },
  })

  // Handlers
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as "active" | "inactive" | "all")
    setPage(1)
  }

  const handleTypeChange = (value: string) => {
    setTypeFilter(value as TechnicianType | "all")
    setPage(1)
  }

  const handleWorkModeChange = (value: string) => {
    setWorkModeFilter(value as WorkMode | "all")
    setPage(1)
  }

  const handleSpecialtyChange = (value: string) => {
    setSpecialtyFilter(value)
    setPage(1)
  }

  const handleDeactivateClick = (technician: TechnicianListItem) => {
    setSelectedTechnician(technician)
    setDeactivateDialogOpen(true)
  }

  const confirmDeactivate = () => {
    if (selectedTechnician) {
      deactivateMutation.mutate(selectedTechnician.id)
    }
  }

  // Derived data
  const technicians = techniciansData?.data || []
  const meta = techniciansData?.meta
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  // Calculate pagination display
  const startItem = total > 0 ? (page - 1) * limit + 1 : 0
  const endItem = Math.min(page * limit, total)

  // Get availability status
  const getAvailabilityStatus = (tech: TechnicianListItem) => {
    if (tech.currentTaskCount >= tech.maxDailyJobs) return "at_capacity"
    if (tech.currentTaskCount > 0) return "busy"
    return "available"
  }

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Available</Badge>
      case "busy":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Busy</Badge>
      case "at_capacity":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">At Capacity</Badge>
      default:
        return null
    }
  }

  const getTypeBadge = (type: TechnicianType) => {
    switch (type) {
      case TechnicianType.FULL_TIME:
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Full-Time</Badge>
      case TechnicianType.FREELANCER:
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Freelancer</Badge>
      default:
        return null
    }
  }

  const getWorkModeBadge = (mode: WorkMode) => {
    switch (mode) {
      case WorkMode.ON_SITE:
        return <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">On-Site</Badge>
      case WorkMode.ON_ROAD:
        return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">On-Road</Badge>
      case WorkMode.HYBRID:
        return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Hybrid</Badge>
      default:
        return null
    }
  }

  // Check if user can manage technicians (ADMIN or DISPATCHER)
  const canManage = user?.role === "ADMIN" || user?.role === "DISPATCHER"

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                Technicians
              </h1>
              <p className="mt-1.5 text-slate-500">
                Manage your field technicians and their assignments
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-72 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm focus:bg-white focus:shadow-md transition-all"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Work Mode Filter */}
              <Select value={workModeFilter} onValueChange={handleWorkModeChange}>
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder="Work Mode" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Refresh */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-11 w-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>

              {/* Availability */}
              <Link href="/technicians/availability">
                <Button variant="outline" className="h-11 rounded-xl gap-2 bg-white/80 backdrop-blur-sm border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                  <Calendar className="size-4" />
                  Availability
                </Button>
              </Link>

              {/* Add Technician */}
              {canManage && (
                <Link href="/technicians/new">
                  <Button className="h-11 px-5 rounded-xl font-medium gap-2">
                    <UserPlus className="size-4" />
                    Add Technician
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              Showing {startItem} to {endItem} of {total} technician{total !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">Failed to load technicians</h3>
              <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : technicians.length === 0 ? (
            <div className="p-16 text-center">
              <User className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">No technicians found</h3>
              <p className="text-sm text-slate-400 mb-4">
                {searchQuery || statusFilter !== "active" || typeFilter !== "all" || specialtyFilter
                  ? "Try adjusting your filters"
                  : "Add your first technician to get started"}
              </p>
              {canManage && !searchQuery && (
                <Link href="/technicians/new">
                  <Button className="rounded-xl">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Technician
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-[250px] font-semibold text-slate-600">Technician</TableHead>
                    <TableHead className="font-semibold text-slate-600">Type</TableHead>
                    <TableHead className="font-semibold text-slate-600">Work Mode</TableHead>
                    <TableHead className="font-semibold text-slate-600">Specialty</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600">Rating</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600">Active Tasks</TableHead>
                    <TableHead className="font-semibold text-slate-600">Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {technicians.map((tech) => {
                  const availStatus = getAvailabilityStatus(tech)
                  return (
                    <TableRow
                      key={tech.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => router.push(`/technicians/${tech.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center text-white font-medium",
                              tech.isOnline ? "bg-green-500" : "bg-slate-400"
                            )}
                          >
                            {tech.firstName[0]}
                            {tech.lastName[0]}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">
                              {tech.firstName} {tech.lastName}
                            </div>
                            <div className="text-sm text-slate-500">{tech.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(tech.technicianType)}</TableCell>
                      <TableCell>{tech.workMode ? getWorkModeBadge(tech.workMode) : <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell>
                        {tech.specialty ? (
                          <span className="text-slate-700 capitalize">{tech.specialty}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="font-medium">
                            {tech.ratingCount > 0 ? tech.rating.toFixed(1) : "N/A"}
                          </span>
                          {tech.ratingCount > 0 && (
                            <span className="text-sm text-slate-400">({tech.ratingCount})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "font-medium",
                            tech.currentTaskCount >= tech.maxDailyJobs
                              ? "text-red-600"
                              : tech.currentTaskCount > 0
                              ? "text-amber-600"
                              : "text-green-600"
                          )}
                        >
                          {tech.currentTaskCount}
                        </span>
                        <span className="text-slate-400">/{tech.maxDailyJobs}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tech.isActive ? (
                            getAvailabilityBadge(availStatus)
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                              Inactive
                            </Badge>
                          )}
                          {tech.isOnline && (
                            <span className="flex items-center text-xs text-green-600">
                              <span className="h-2 w-2 rounded-full bg-green-500 mr-1" />
                              Online
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/technicians/${tech.id}`)}
                            >
                              View Details
                            </DropdownMenuItem>
                            {canManage && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => router.push(`/technicians/${tech.id}?edit=true`)}
                                >
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {tech.isActive ? (
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => handleDeactivateClick(tech)}
                                  >
                                    Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-green-600"
                                    onClick={() => reactivateMutation.mutate(tech.id)}
                                  >
                                    Reactivate
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Technician</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{" "}
              <span className="font-medium text-slate-800">
                {selectedTechnician?.firstName} {selectedTechnician?.lastName}
              </span>
              ? They will no longer be able to receive new task assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-red-600 hover:bg-red-700"
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
