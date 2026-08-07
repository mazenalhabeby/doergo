"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  ClipboardList,
  Calendar,
  BarChart3,
  Edit,
  MoreHorizontal,
  Mail,
  Building2,
  AlertCircle,
  Activity,
  Umbrella,
} from "lucide-react"
import { format } from "date-fns"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  employeesApi,
  type EmployeeProfile,
  type EmployeeStats,
  type UpdateEmployeeInput,
  type Task,
  type TimeEntry,

} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

import {
  OverviewTab,
  TasksTab,
  AttendanceTab,
  LocationsTab,
  PerformanceTab,
  ScheduleTab,
  TimeOffTab,
} from "./_components"

const SPECIALTY_OPTIONS = [
  { value: "Electrical", label: "Electrical" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Mechanical", label: "Mechanical" },
  { value: "HVAC", label: "HVAC" },
  { value: "General", label: "General" },
  { value: "Other", label: "Other" },
] as const

export default function EmployeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const employeeId = params.id as string
  const [activeTab, setActiveTab] = useState("overview")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)

  // Edit form state
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editWorkMode, setEditWorkMode] = useState<string>("position")
  const [editSpecialty, setEditSpecialty] = useState("")
  const [editEmploymentType, setEditEmploymentType] = useState<string>("EXTERNAL")
  const [editMaxDailyJobs, setEditMaxDailyJobs] = useState(5)
  const [editCanCreateTasks, setEditCanCreateTasks] = useState(false)
  const [editUseOrgBadgeDefaults, setEditUseOrgBadgeDefaults] = useState(true)
  const [editBadgeShowRole, setEditBadgeShowRole] = useState(true)
  const [editBadgeShowWorkMode, setEditBadgeShowWorkMode] = useState(true)
  const [editBadgeShowType, setEditBadgeShowType] = useState(true)
  const [editBadgeShowSpecialty, setEditBadgeShowSpecialty] = useState(true)

  // Fetch employee detail
  const { data: employee, isLoading, isError, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => employeesApi.getById(employeeId),
    enabled: !!employeeId,
    staleTime: 30_000,
  })

  // Fetch tasks for employee
  const { data: tasks } = useQuery({
    queryKey: ["employeeTasks", employeeId],
    queryFn: () => employeesApi.getTasks(employeeId),
    enabled: !!employeeId && activeTab === "tasks",
    staleTime: 30_000,
  })

  // Fetch attendance for employee
  const { data: attendance } = useQuery({
    queryKey: ["employeeAttendance", employeeId],
    queryFn: () => employeesApi.getAttendance(employeeId),
    enabled: !!employeeId && activeTab === "attendance",
    staleTime: 30_000,
  })

  // Fetch performance metrics
  const { data: performance } = useQuery({
    queryKey: ["employeePerformance", employeeId],
    queryFn: () => employeesApi.getPerformance(employeeId),
    enabled: !!employeeId && activeTab === "performance",
    staleTime: 30_000,
  })

  // Fetch assignments
  const { data: assignments } = useQuery({
    queryKey: ["employeeAssignments", employeeId],
    queryFn: () => employeesApi.getAssignments(employeeId),
    enabled: !!employeeId && activeTab === "locations",
    staleTime: 30_000,
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (input: UpdateEmployeeInput) => employeesApi.update(employeeId, input),
    onSuccess: () => {
      notify.success(t('technicians.detail.updatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      setEditDialogOpen(false)
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.detail.failedToUpdate'))
    },
  })

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: () => employeesApi.deactivate(employeeId),
    onSuccess: () => {
      notify.success(t('technicians.detail.deactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      setDeactivateDialogOpen(false)
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.detail.failedToDeactivate'))
    },
  })

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: () => employeesApi.update(employeeId, { isActive: true }),
    onSuccess: () => {
      notify.success(t('technicians.detail.reactivatedSuccessfully'))
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.detail.failedToReactivate'))
    },
  })

  const openEditDialog = () => {
    if (employee) {
      setEditFirstName(employee.firstName)
      setEditLastName(employee.lastName)
      setEditWorkMode(employee.position || "employee")
      setEditSpecialty(employee.specialty || "")
      setEditEmploymentType(employee.employmentType || "EXTERNAL")
      setEditMaxDailyJobs(employee.maxDailyJobs || 5)
      setEditCanCreateTasks(employee.canCreateTasks ?? false)
      const badges = employee.profileBadges
      if (badges == null) {
        setEditUseOrgBadgeDefaults(true)
        setEditBadgeShowRole(true)
        setEditBadgeShowWorkMode(true)
        setEditBadgeShowType(true)
        setEditBadgeShowSpecialty(true)
      } else {
        setEditUseOrgBadgeDefaults(false)
        setEditBadgeShowRole(badges.showRole)
        setEditBadgeShowWorkMode(true)
        setEditBadgeShowType(badges.showType)
        setEditBadgeShowSpecialty(badges.showSpecialty)
      }
      setEditDialogOpen(true)
    }
  }

  const handleEditSubmit = () => {
    updateMutation.mutate({
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
      position: editWorkMode,
      specialty: editSpecialty.trim() || undefined,
      employmentType: editEmploymentType,
      maxDailyJobs: editMaxDailyJobs,
      canCreateTasks: editCanCreateTasks,
      profileBadges: editUseOrgBadgeDefaults
        ? null
        : {
            showRole: editBadgeShowRole,
            
            showType: editBadgeShowType,
            showSpecialty: editBadgeShowSpecialty,
          },
    })
  }

  const stats = employee?.stats


  // Check if user can manage employees (ADMIN or can-view-all-tasks)
  const canManage = user?.role === "ADMIN" || !!user?.canViewAllTasks

  if (isLoading) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <div className="bg-card rounded-xl border border-border/80 shadow-sm p-6">
            <div className="flex gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-3 flex-1">
                <Skeleton className="h-8 w-64 rounded-lg" />
                <Skeleton className="h-4 w-48 rounded-lg" />
                <Skeleton className="h-4 w-32 rounded-lg" />
              </div>
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (isError || !employee) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Link href="/employees">
            <Button variant="ghost" size="sm" className="gap-2 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
              {t('technicians.detail.backToTechnicians')}
            </Button>
          </Link>
          <div className="bg-card rounded-xl border border-border/80 shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('technicians.detail.notFound')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {(error as Error)?.message || t('technicians.detail.notFoundDescription')}
            </p>
            <Link href="/employees">
              <Button className="rounded-xl">{t('technicians.detail.backToTechnicians')}</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Back button */}
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-2 rounded-lg hover:bg-card/80">
            <ArrowLeft className="h-4 w-4" />
            {t('technicians.detail.backToTechnicians')}
          </Button>
        </Link>

        {/* Profile Header */}
        <div className="bg-card rounded-xl border border-border/80 shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              {/* Avatar */}
              <div
                className={cn(
                  "h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-medium shadow-md",
                  employee.isOnline ? "bg-green-500" : "bg-muted-foreground"
                )}
              >
                {employee.firstName[0]}
                {employee.lastName[0]}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">
                    {employee.firstName} {employee.lastName}
                  </h1>
                  {employee.canCreateTasks && (
                    <Badge className="bg-emerald-100 text-emerald-700">{t('technicians.detail.canCreateTasks')}</Badge>
                  )}
                  {employee.isActive ? (
                    employee.isOnline ? (
                      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">{t('common.online')}</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">{t('common.offline')}</Badge>
                    )
                  ) : (
                    <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">{t('common.inactive')}</Badge>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    {employee.email}
                  </span>
                  {employee.specialty && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4" />
                      {employee.specialty}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {/* Rating */}
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "h-5 w-5",
                          star <= Math.round(employee.rating)
                            ? "text-amber-400 fill-amber-400"
                            : "text-muted-foreground"
                        )}
                      />
                    ))}
                    <span className="ml-1 text-sm font-medium">
                      {employee.rating.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({t('technicians.detail.reviews', { count: employee.ratingCount })})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-lg">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEditDialog}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('technicians.actions.editProfile')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {employee.isActive ? (
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeactivateDialogOpen(true)}
                    >
                      {t('technicians.actions.deactivate')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="text-green-600"
                      onClick={() => reactivateMutation.mutate()}
                    >
                      {t('technicians.actions.reactivate')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-tour="employee-detail-tabs" className="bg-card border border-border/80 shadow-sm">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              {t('technicians.detail.tabs.overview')}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              {t('technicians.detail.tabs.tasks')}
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2">
              <Clock className="h-4 w-4" />
              {t('technicians.detail.tabs.attendance')}
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-2">
              <MapPin className="h-4 w-4" />
              {t('technicians.detail.tabs.locations')}
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2">
              <Calendar className="h-4 w-4" />
              {t('technicians.detail.tabs.schedule')}
            </TabsTrigger>
            <TabsTrigger value="time-off" className="gap-2">
              <Umbrella className="h-4 w-4" />
              {t('technicians.detail.tabs.timeOff')}
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('technicians.detail.tabs.performance')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab stats={stats} />
          </TabsContent>

          <TabsContent value="tasks">
            <TasksTab tasks={tasks} />
          </TabsContent>

          <TabsContent value="attendance">
            <AttendanceTab
              attendance={attendance}
              employeeId={employeeId}
              employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
              canManage={!!user?.canManageUsers}
            />
          </TabsContent>

          <TabsContent value="locations">
            <LocationsTab assignments={assignments} />
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleTab employeeId={employeeId} canManage={canManage} />
          </TabsContent>

          <TabsContent value="time-off">
            <TimeOffTab employeeId={employeeId} canManage={canManage} />
          </TabsContent>

          <TabsContent value="performance">
            <PerformanceTab performance={performance} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('technicians.detail.editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('technicians.detail.editDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">{t('technicians.detail.editDialog.firstNameLabel')}</Label>
                <Input
                  id="edit-firstName"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">{t('technicians.detail.editDialog.lastNameLabel')}</Label>
                <Input
                  id="edit-lastName"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('technicians.detail.editDialog.employmentTypeLabel')}</Label>
              <Select value={editEmploymentType} onValueChange={setEditEmploymentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTERNAL">
                    {t('technicians.detail.editDialog.employmentType.external', 'External / freelancer')}
                  </SelectItem>
                  <SelectItem value="IN_HOUSE">
                    {t('technicians.detail.editDialog.employmentType.inHouse', 'In-house (employed)')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(
                  'technicians.detail.editDialog.employmentType.hint',
                  'In-house field technicians are billed at the discounted €9 seat; external at €15.',
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-specialty">{t('technicians.detail.editDialog.jobTitleLabel')}</Label>
              <Input
                id="edit-specialty"
                value={editSpecialty}
                onChange={(e) => setEditSpecialty(e.target.value)}
                placeholder={t('technicians.detail.editDialog.jobTitlePlaceholder')}
                list="edit-specialty-suggestions"
              />
              <datalist id="edit-specialty-suggestions">
                {SPECIALTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.label} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-maxJobs">{t('technicians.detail.editDialog.maxDailyJobsLabel')}</Label>
              <Input
                id="edit-maxJobs"
                type="number"
                min={1}
                max={20}
                value={editMaxDailyJobs}
                onChange={(e) => setEditMaxDailyJobs(parseInt(e.target.value) || 5)}
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Checkbox
                id="edit-canCreateTasks"
                checked={editCanCreateTasks}
                onCheckedChange={(checked) => setEditCanCreateTasks(!!checked)}
              />
              <div>
                <label htmlFor="edit-canCreateTasks" className="text-sm font-medium cursor-pointer">
                  {t('technicians.detail.editDialog.canCreateTasksLabel')}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t('technicians.detail.editDialog.canCreateTasksDescription')}
                </p>
              </div>
            </div>

            {/* Profile Badges */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">{t('technicians.detail.profileBadges')}</Label>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Checkbox
                  id="edit-useOrgBadgeDefaults"
                  checked={editUseOrgBadgeDefaults}
                  onCheckedChange={(checked) => setEditUseOrgBadgeDefaults(!!checked)}
                />
                <label htmlFor="edit-useOrgBadgeDefaults" className="text-sm font-medium cursor-pointer">
                  {t('technicians.detail.useOrgDefaults')}
                </label>
              </div>
              {!editUseOrgBadgeDefaults && (
                <div className="space-y-2 pl-1">
                  {[
                    { id: "edit-badgeShowRole", label: t('technicians.detail.badgeShowRole'), checked: editBadgeShowRole, onChange: setEditBadgeShowRole },
                    { id: "edit-badgeShowWorkMode", label: t('technicians.detail.badgeShowWorkMode'), checked: editBadgeShowWorkMode, onChange: setEditBadgeShowWorkMode },
                    { id: "edit-badgeShowType", label: t('technicians.detail.badgeShowType'), checked: editBadgeShowType, onChange: setEditBadgeShowType },
                    { id: "edit-badgeShowSpecialty", label: t('technicians.detail.badgeShowSpecialty'), checked: editBadgeShowSpecialty, onChange: setEditBadgeShowSpecialty },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                      <Checkbox
                        id={item.id}
                        checked={item.checked}
                        onCheckedChange={(checked) => item.onChange(!!checked)}
                      />
                      <label htmlFor={item.id} className="text-sm cursor-pointer">
                        {item.label}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editFirstName.trim() || !editLastName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? t('common.saving') : t('common.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('technicians.deactivateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('technicians.deactivateDialog.descriptionExtended', { name: `${employee?.firstName} ${employee?.lastName}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deactivateMutation.mutate()}
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
