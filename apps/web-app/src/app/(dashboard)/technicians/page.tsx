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
import { useTranslation } from "react-i18next"

export default function TechniciansPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active")
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
    workMode: workModeFilter,
    specialty: specialtyFilter !== "all" ? specialtyFilter : undefined,
    search: searchQuery || undefined,
    page,
    limit,

  // Fetch technicians
  const { data: techniciansData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["technicians", queryParams],
    queryFn: () => techniciansApi.list(queryParams),
  })

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => techniciansApi.deactivate(id),
    onSuccess: () => {
      toast.success(t('technicians.list.deactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
      setDeactivateDialogOpen(false)
      setSelectedTechnician(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || t('technicians.detail.failedToDeactivate'))
    },
  })

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => techniciansApi.update(id, { isActive: true }),
    onSuccess: () => {
      toast.success(t('technicians.list.reactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('technicians.detail.failedToReactivate'))
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
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('technicians.availability.available')}</Badge>
      case "busy":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t('technicians.availability.busy')}</Badge>
      case "at_capacity":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{t('technicians.availability.atCapacity')}</Badge>
      default:
        return null
    }
  }

    switch (type) {
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{t('technicians.types.fullTime')}</Badge>
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">{t('technicians.types.freelancer')}</Badge>
      default:
        return null
    }
  }

  const getWorkModeBadge = (mode: WorkMode) => {
    switch (mode) {
      case WorkMode.ON_SITE:
        return <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">{t('technicians.workModes.onSite')}</Badge>
      case WorkMode.ON_ROAD:
        return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">{t('technicians.workModes.onRoad')}</Badge>
      case WorkMode.HYBRID:
        return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{t('technicians.workModes.hybrid')}</Badge>
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
                {t('technicians.list.title')}
              </h1>
              <p className="mt-1.5 text-slate-500">
                {t('technicians.list.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t('technicians.list.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-72 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm focus:bg-white focus:shadow-md transition-all"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder={t('common.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('common.active')}</SelectItem>
                  <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Type Filter */}
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder={t('technicians.table.type')} />
                </SelectTrigger>
                <SelectContent>
                </SelectContent>
              </Select>

              {/* Work Mode Filter */}
              <Select value={workModeFilter} onValueChange={handleWorkModeChange}>
                <SelectTrigger className="w-[130px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder={t('technicians.table.workMode')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allModes')}</SelectItem>
                  <SelectItem value={WorkMode.ON_SITE}>{t('technicians.workModes.onSite')}</SelectItem>
                  <SelectItem value={WorkMode.ON_ROAD}>{t('technicians.workModes.onRoad')}</SelectItem>
                  <SelectItem value={WorkMode.HYBRID}>{t('technicians.workModes.hybrid')}</SelectItem>
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
                  {t('technicians.list.availability')}
                </Button>
              </Link>

            </div>
          </div>
        </div>

        {/* Summary */}
        {total > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              {t('technicians.list.showingRange', { start: startItem, end: endItem, total, plural: total !== 1 ? "s" : "" })}
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
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t('technicians.list.failedToLoad')}</h3>
              <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => refetch()}>
                {t('common.tryAgain')}
              </Button>
            </div>
          ) : technicians.length === 0 ? (
            <div className="p-16 text-center">
              <User className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">{t('technicians.list.noTechniciansFound')}</h3>
              <p className="text-sm text-slate-400 mb-4">
                  ? t('technicians.list.noTechniciansHint')
                  : t('technicians.list.addFirstTechnician')}
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
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-[250px] font-semibold text-slate-600">{t('technicians.table.technician')}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t('technicians.table.type')}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t('technicians.table.workMode')}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t('technicians.table.specialty')}</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600">{t('technicians.table.rating')}</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600">{t('technicians.table.activeTasks')}</TableHead>
                    <TableHead className="font-semibold text-slate-600">{t('technicians.table.status')}</TableHead>
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
                            {tech.ratingCount > 0 ? tech.rating.toFixed(1) : t('common.notAvailable')}
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
                              onClick={() => router.push(`/technicians/${tech.id}`)}
                            >
                              {t('technicians.actions.viewDetails')}
                            </DropdownMenuItem>
                            {canManage && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => router.push(`/technicians/${tech.id}?edit=true`)}
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
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">
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
              {t('technicians.deactivateDialog.description', { name: `${selectedTechnician?.firstName} ${selectedTechnician?.lastName}` })}
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
