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
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  employeesApi,
  type EmployeeListItem,
  type EmployeesQueryParams,
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
import { useTranslation } from "react-i18next"

export default function EmployeesPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active")
  const [specialtyFilter, setSpecialtyFilter] = useState("all")
  const [page, setPage] = useState(1)
  const limit = 10

  // Deactivate dialog state
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeListItem | null>(null)

  // Build query params
  const queryParams: EmployeesQueryParams = useMemo(() => ({
    status: statusFilter,
    specialty: specialtyFilter !== "all" ? specialtyFilter : undefined,
    search: searchQuery || undefined,
    page,
    limit,
  }), [statusFilter, specialtyFilter, searchQuery, page, limit])

  // Fetch employees
  const { data: employeesData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["employees", queryParams],
    queryFn: () => employeesApi.list(queryParams),
  })

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => employeesApi.deactivate(id),
    onSuccess: () => {
      notify.success(t('technicians.list.deactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      setDeactivateDialogOpen(false)
      setSelectedEmployee(null)
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.detail.failedToDeactivate'))
    },
  })

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => employeesApi.update(id, { isActive: true }),
    onSuccess: () => {
      notify.success(t('technicians.list.reactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.detail.failedToReactivate'))
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
    setPage(1)
  }

  const handleSpecialtyChange = (value: string) => {
    setSpecialtyFilter(value)
    setPage(1)
  }

  const handleDeactivateClick = (employee: EmployeeListItem) => {
    setSelectedEmployee(employee)
    setDeactivateDialogOpen(true)
  }

  const confirmDeactivate = () => {
    if (selectedEmployee) {
      deactivateMutation.mutate(selectedEmployee.id)
    }
  }

  // Derived data
  const employees = employeesData?.data || []
  const meta = employeesData?.meta
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  // Calculate pagination display
  const startItem = total > 0 ? (page - 1) * limit + 1 : 0
  const endItem = Math.min(page * limit, total)

  // Get availability status
  const getAvailabilityStatus = (tech: EmployeeListItem) => {
    if (tech.currentTaskCount >= tech.maxDailyJobs) return "at_capacity"
    if (tech.currentTaskCount > 0) return "busy"
    return "available"
  }

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-100">{t('technicians.availability.available')}</Badge>
      case "busy":
        return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-100">{t('technicians.availability.busy')}</Badge>
      case "at_capacity":
        return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-100">{t('technicians.availability.atCapacity')}</Badge>
      default:
        return null
    }
  }

  const getPositionBadge = (position?: string | null) => {
    if (!position) return <span className="text-muted-foreground">--</span>
    return <Badge className="bg-muted text-muted-foreground">{position}</Badge>
  }

  // Check if user can manage employees (ADMIN or can-view-all-tasks)
  const canManage = user?.role === "ADMIN" || !!user?.canViewAllTasks

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                {t('technicians.list.title')}
              </h1>
              <p className="mt-1.5 text-muted-foreground">
                {t('technicians.list.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('technicians.list.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-72 h-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm focus:bg-card focus:shadow-md transition-all"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px] h-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm">
                  <SelectValue placeholder={t('common.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('common.active')}</SelectItem>
                  <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                </SelectContent>
              </Select>


              {/* Removed WorkMode filter - replaced by position/modules */}

              {/* Refresh */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-11 w-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>

              {/* Availability */}
              <Link href="/employees/availability">
                <Button variant="outline" className="h-11 rounded-xl gap-2 bg-card/80 backdrop-blur-sm border-border/80 shadow-sm hover:shadow-md transition-all">
                  <Calendar className="size-4" />
                  {t('technicians.list.availability')}
                </Button>
              </Link>

            </div>
          </div>
        </div>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              {t('technicians.list.showingRange', { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
            </p>
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-xl border border-border/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">{t('technicians.list.failedToLoad')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{(error as Error)?.message}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => refetch()}>
                {t('common.tryAgain')}
              </Button>
            </div>
          ) : employees.length === 0 ? (
            <div className="p-16 text-center">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">{t('technicians.list.noTechniciansFound')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery ? t('technicians.list.noTechniciansHint') : t('technicians.list.addFirstTechnician')}
              </p>
              {canManage && !searchQuery && (
                <Link href="/members/invite">
                  <Button className="rounded-xl">
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t("members.inviteMember")}
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="w-[250px] font-semibold text-muted-foreground">{t('technicians.table.technician')}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t('technicians.table.type')}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t('technicians.table.position', 'Position')}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t('technicians.table.specialty')}</TableHead>
                    <TableHead className="text-center font-semibold text-muted-foreground">{t('technicians.table.rating')}</TableHead>
                    <TableHead className="text-center font-semibold text-muted-foreground">{t('technicians.table.activeTasks')}</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">{t('technicians.table.status')}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {employees.map((tech) => {
                  const availStatus = getAvailabilityStatus(tech)
                  return (
                    <TableRow
                      key={tech.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => router.push(`/employees/${tech.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center text-white font-medium",
                              tech.isOnline ? "bg-green-500" : "bg-muted-foreground"
                            )}
                          >
                            {tech.firstName[0]}
                            {tech.lastName[0]}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {tech.firstName} {tech.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">{tech.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{tech.position && <Badge className="bg-muted text-muted-foreground">{tech.position}</Badge>}</TableCell>
                      <TableCell>{getPositionBadge(tech.position)}</TableCell>
                      <TableCell>
                        {tech.specialty ? (
                          <span className="text-foreground capitalize">{tech.specialty}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="font-medium">
                            {tech.ratingCount > 0 ? tech.rating.toFixed(1) : t('common.notAvailable')}
                          </span>
                          {tech.ratingCount > 0 && (
                            <span className="text-sm text-muted-foreground">({tech.ratingCount})</span>
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
                        <span className="text-muted-foreground">/{tech.maxDailyJobs}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tech.isActive ? (
                            getAvailabilityBadge(availStatus)
                          ) : (
                            <Badge className="bg-muted text-muted-foreground hover:bg-accent">
                              {t('common.inactive')}
                            </Badge>
                          )}
                          {tech.isOnline && (
                            <span className="flex items-center text-xs text-green-600">
                              <span className="h-2 w-2 rounded-full bg-green-500 mr-1" />
                              {t('common.online')}
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
                              onClick={() => router.push(`/employees/${tech.id}`)}
                            >
                              {t('technicians.actions.viewDetails')}
                            </DropdownMenuItem>
                            {canManage && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => router.push(`/employees/${tech.id}?edit=true`)}
                                >
                                  {t('technicians.actions.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {tech.isActive ? (
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => handleDeactivateClick(tech)}
                                  >
                                    {t('technicians.actions.deactivate')}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-green-600"
                                    onClick={() => reactivateMutation.mutate(tech.id)}
                                  >
                                    {t('technicians.actions.reactivate')}
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
              <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {t('common.page', { page, totalPages })}
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
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t('common.next')}
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
            <AlertDialogTitle>{t('technicians.deactivateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('technicians.deactivateDialog.description', { name: `${selectedEmployee?.firstName} ${selectedEmployee?.lastName}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-red-600 hover:bg-red-700"
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? t('common.deactivating') : t('technicians.actions.deactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
