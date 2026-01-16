"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  UserPlus,
  MapPin,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, type TaskStatus } from "@/components/tasks/status-badge"
import { PriorityBadge, type TaskPriority } from "@/components/tasks/priority-badge"
import { toast } from "sonner"

// Status options for filter
const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
]

// Priority options for filter
const priorityOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Priorities" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
]

export default function TasksPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const isDispatcher = user?.role === "DISPATCHER"
  const isClient = user?.role === "CLIENT"
  const canAssign = isClient || isDispatcher

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all"
  )
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Fetch tasks from API
  const { data: tasksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tasks", { status: statusFilter, priority: priorityFilter, page, limit }],
    queryFn: () => tasksApi.list({ status: statusFilter, priority: priorityFilter, page, limit }),
  })

  // Delete task mutation
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onSuccess: () => {
      toast.success("Task deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete task")
    },
  })

  const tasks = tasksData?.data || []
  const meta = tasksData?.meta

  // Client-side search filter (for searching within loaded data)
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks
    return tasks.filter((task: Task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (task.locationAddress?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      return matchesSearch
    })
  }, [tasks, searchQuery])

  // Stats for header (from loaded data)
  const stats = useMemo(() => {
    return {
      total: meta?.total || 0,
      new: tasks.filter((t: Task) => t.status === "NEW").length,
      inProgress: tasks.filter((t: Task) => t.status === "IN_PROGRESS").length,
      completed: tasks.filter((t: Task) => t.status === "COMPLETED").length,
    }
  }, [tasks, meta])

  // Handle filter changes - reset to page 1
  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handlePriorityChange = (value: string) => {
    setPriorityFilter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            {isDispatcher ? "All Tasks" : "My Tasks"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isDispatcher
              ? "Manage and assign tasks to technicians"
              : "View and manage your service requests"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {canAssign && (
            <Button asChild>
              <Link href="/tasks/new">
                <Plus className="mr-2 size-4" />
                Create Task
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            )}
            <p className="text-sm text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
            )}
            <p className="text-sm text-muted-foreground">New</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">
                {stats.inProgress}
              </div>
            )}
            <p className="text-sm text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {stats.completed}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {isError && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Filter className="size-8 text-red-500" />
              <p className="text-red-600 font-medium">Failed to load tasks</p>
              <p className="text-sm">{(error as Error)?.message || "Please try again later"}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                <RefreshCw className="mr-2 size-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks Table */}
      {!isError && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  {canAssign && <TableHead>Assigned To</TableHead>}
                  <TableHead>Due Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading skeleton rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      {canAssign && <TableCell><Skeleton className="h-6 w-32" /></TableCell>}
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canAssign ? 7 : 6}
                      className="h-32 text-center"
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Filter className="size-8" />
                        <p>No tasks found</p>
                        <p className="text-sm">
                          {statusFilter !== "all" || priorityFilter !== "all"
                            ? "Try adjusting your filters"
                            : !isDispatcher
                            ? "Create your first task to get started"
                            : "No tasks have been created yet"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task: Task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="font-medium text-slate-800 hover:text-blue-600 hover:underline"
                          >
                            {task.title}
                          </Link>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {task.description || "No description"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={task.status as TaskStatus} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={task.priority as TaskPriority} />
                      </TableCell>
                      {canAssign && (
                        <TableCell>
                          {task.assignedTo ? (
                            <div className="flex items-center gap-2">
                              <div className="flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                                {task.assignedTo.firstName[0]}
                                {task.assignedTo.lastName[0]}
                              </div>
                              <span className="text-sm">
                                {task.assignedTo.firstName}{" "}
                                {task.assignedTo.lastName}
                              </span>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-amber-600 border-amber-200 bg-amber-50"
                            >
                              Unassigned
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {task.dueDate ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="size-3.5" />
                            {new Date(task.dueDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {task.locationAddress ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground max-w-[200px]">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="truncate">{task.locationAddress}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/tasks/${task.id}`}>
                                <Eye className="mr-2 size-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {canAssign && !task.assignedTo && (
                              <DropdownMenuItem asChild>
                                <Link href={`/tasks/${task.id}?assign=true`}>
                                  <UserPlus className="mr-2 size-4" />
                                  Assign Technician
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {isClient && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link href={`/tasks/${task.id}/edit`}>
                                    <Pencil className="mr-2 size-4" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onSelect={(e) => e.preventDefault()}
                                    >
                                      <Trash2 className="mr-2 size-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Task</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete &ldquo;{task.title}&rdquo;? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMutation.mutate(task.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={deleteMutation.isPending}
                                      >
                                        {deleteMutation.isPending ? (
                                          <>
                                            <Loader2 className="mr-2 size-4 animate-spin" />
                                            Deleting...
                                          </>
                                        ) : (
                                          "Delete"
                                        )}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && !isError && meta && meta.totalPages > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {filteredTasks.length} of {meta.total} tasks
            {searchQuery && ` (filtered from ${tasks.length})`}
          </p>
          {meta.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
