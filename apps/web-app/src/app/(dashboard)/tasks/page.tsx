"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ClipboardList,
  Filter,
  Plus,
} from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type Task, type SuggestedTechnician } from "@/lib/api"
import { TaskCard } from "@/components/tasks"
import { TechnicianAssignDialog } from "@/components/technicians/technician-assign-dialog"
import type { TechnicianData } from "@/components/technicians/technician-assign-dialog"
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
import { cn } from "@/lib/utils"
import { PRIORITY_FILTER_OPTIONS, getStatusConfig } from "@/lib/constants"

// Priority sort order
const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

// Status tabs configuration with icons
const STATUS_TABS = [
  { value: "all", label: "All Tasks" },
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "EN_ROUTE", label: "En Route" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
  { value: "CLOSED", label: "Closed" },
] as const

export default function TasksPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "NEW"
  )
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Fetch tasks from API
  const { data: tasksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tasks", { status: statusFilter, priority: priorityFilter, page, limit }],
    queryFn: () => tasksApi.list({ status: statusFilter, priority: priorityFilter, page, limit }),
  })

  // Fetch status counts for tabs
  const { data: statusCounts, refetch: refetchCounts } = useQuery({
    queryKey: ["taskStatusCounts"],
    queryFn: () => tasksApi.getStatusCounts(),
    staleTime: 30000, // Cache for 30 seconds
  })

  // Fetch suggested technicians for the selected task
  const { data: suggestedData, isLoading: loadingSuggested } = useQuery({
    queryKey: ["suggestedTechnicians", selectedTaskId],
    queryFn: () => tasksApi.getSuggestedTechnicians(selectedTaskId!),
    enabled: assignDialogOpen && !!selectedTaskId,
    staleTime: 0, // Always refetch when dialog opens
  })

  // Transform to technician data format (add avatarUrl if needed)
  const technicians: TechnicianData[] = useMemo(() => {
    return (suggestedData?.technicians || []).map((tech: SuggestedTechnician) => ({
      ...tech,
      avatarUrl: undefined, // No avatar URL from backend yet
    }))
  }, [suggestedData])

  // Get suggested technician ID from backend
  const suggestedTechnicianId = suggestedData?.suggestedTechnicianId

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: (workerId: string) => {
      if (!selectedTaskId) throw new Error("No task selected")
      return tasksApi.assign(selectedTaskId, workerId)
    },
    onSuccess: () => {
      toast.success("Technician assigned successfully")
      setAssignDialogOpen(false)
      setSelectedTaskId(null)
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Handle assign button click from task card
  const handleAssignClick = (taskId: string) => {
    setSelectedTaskId(taskId)
    setAssignDialogOpen(true)
  }

  // Refetch both tasks and counts
  const handleRefresh = () => {
    refetch()
    refetchCounts()
  }

  const tasks = tasksData?.data || []
  const meta = tasksData?.meta

  // Client-side search filter and sort by priority
  const filteredTasks = useMemo(() => {
    let result = tasks

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((task: Task) =>
        task.title.toLowerCase().includes(query) ||
        task.id.toLowerCase().includes(query)
      )
    }

    return [...result].sort((a: Task, b: Task) => {
      const orderA = PRIORITY_ORDER[a.priority] ?? 99
      const orderB = PRIORITY_ORDER[b.priority] ?? 99
      return orderA - orderB
    })
  }, [tasks, searchQuery])

  // Handle filter changes - reset to page 1
  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handlePriorityChange = (value: string) => {
    setPriorityFilter(value)
    setPage(1)
  }

  // Pagination
  const totalPages = meta?.totalPages || 1
  const startItem = (page - 1) * limit + 1
  const endItem = Math.min(page * limit, meta?.total || 0)

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                Service Requests
              </h1>
              <p className="mt-1.5 text-slate-500">
                Track, assign, and monitor all maintenance operations in real-time
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-72 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm focus:bg-white focus:shadow-md transition-all"
                />
              </div>

              {/* Priority Filter */}
              <Select value={priorityFilter} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-[140px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <Filter className="size-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
                className="h-11 w-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>

              {/* Create Task Button */}
              <Link href="/tasks/new">
                <Button
                  className={cn(
                    "h-11 px-5 rounded-xl font-medium",
                    "bg-blue-600 text-white",
                    "hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25",
                    "transition-all duration-200"
                  )}
                >
                  <Plus className="size-4 mr-2" />
                  Create Task
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm mb-6">
          <div className="flex items-center overflow-x-auto scrollbar-hide">
            {STATUS_TABS.map((tab, index) => {
              const isActive = statusFilter === tab.value
              const statusConfig = tab.value !== "all" ? getStatusConfig(tab.value) : null
              const count = statusCounts?.[tab.value] ?? 0

              return (
                <button
                  key={tab.value}
                  onClick={() => handleStatusChange(tab.value)}
                  className={cn(
                    "relative flex items-center gap-2 px-5 py-4 text-sm font-medium whitespace-nowrap transition-all duration-200",
                    "hover:bg-slate-50/80",
                    isActive
                      ? "text-blue-600"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {statusConfig && (
                    <span
                      className={cn(
                        "size-2 rounded-full transition-all duration-200",
                        isActive && "ring-4 ring-blue-100"
                      )}
                      style={{ backgroundColor: isActive ? "#2563eb" : statusConfig.hex }}
                    />
                  )}
                  {tab.label}

                  {/* Count badge */}
                  {count > 0 && (
                    <span
                      className={cn(
                        "min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold flex items-center justify-center",
                        isActive
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}

                  {/* Active indicator line */}
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results Count */}
        {!isLoading && !isError && meta && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700">{filteredTasks.length}</span> of{" "}
              <span className="font-medium text-slate-700">{meta.total}</span> tasks
            </p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
                <ClipboardList className="size-8 text-red-500" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">Failed to load tasks</p>
                <p className="text-slate-500 mt-1">{(error as Error)?.message || "Please try again later"}</p>
              </div>
              <Button onClick={handleRefresh} className="mt-2 rounded-xl">
                <RefreshCw className="mr-2 size-4" />
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                <div className="flex items-start gap-6">
                  <Skeleton className="size-12 rounded-xl" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Skeleton className="h-6 w-24 rounded-full" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-6 w-80 mb-2" />
                    <Skeleton className="h-4 w-full max-w-2xl mb-4" />
                    <div className="flex items-center gap-6">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-44" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && filteredTasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="size-20 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <ClipboardList className="size-10 text-slate-300" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">No tasks found</p>
                <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                  {statusFilter !== "all" || priorityFilter !== "all" || searchQuery
                    ? "Try adjusting your filters or search query"
                    : "Create your first task to get started"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Task Cards */}
        {!isLoading && !isError && filteredTasks.length > 0 && (
          <div className="grid gap-4">
            {filteredTasks.map((task: Task) => (
              <TaskCard
                key={task.id}
                task={task}
                onAssign={handleAssignClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !isError && meta && meta.total > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center mt-8 gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4" />
            </Button>

            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pageNum = i + 1
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="icon"
                  className={cn(
                    "size-10 rounded-xl font-medium",
                    page === pageNum && "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/25"
                  )}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            })}

            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}

        {/* Bottom Padding */}
        <div className="h-8" />
      </div>

      {/* Technician Assign Dialog */}
      <TechnicianAssignDialog
        open={assignDialogOpen}
        onOpenChange={(open) => {
          setAssignDialogOpen(open)
          if (!open) setSelectedTaskId(null)
        }}
        technicians={technicians}
        isLoading={loadingSuggested}
        isAssigning={assignMutation.isPending}
        onAssign={(techId) => assignMutation.mutate(techId)}
        suggestedTechnicianId={suggestedTechnicianId}
      />
    </div>
  )
}
