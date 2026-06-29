"use client"

import { useState, useCallback, memo } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import {
  Plus,
  MoreHorizontal,
  Users,
  Settings2,

  ToggleRight,
  ToggleLeft,
  Building2,
  ChevronRight,
  X,
  UserPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AVAILABLE_MODULES, MODULE_GROUPS, MODULE_PRESETS, ATTENDANCE_CONSTANTS } from "@hbcfield/shared/client"

const { MIN_GEOFENCE_RADIUS: GEO_MIN, MAX_GEOFENCE_RADIUS: GEO_MAX, DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT } = ATTENDANCE_CONSTANTS

// Same map picker used by the New-Space form — reused here so Configure shows
// the identical location experience (DRY).
const LocationPicker = dynamic(() => import("./_components/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

import { useAuth } from "@/contexts/auth-context"
import {
  locationsApi,
  workflowsApi,
  employeesApi,
  type CompanyLocation,
  type UpdateLocationInput,
  type StatusWorkflow,
  type AssignMemberInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WorkflowSelector } from "./_components/workflow-selector"
import { WorkflowBuilder } from "./_components/workflow-builder"
import { SpaceForm } from "./_components/space-form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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


const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const

const TIMEZONES = [
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Europe/Vienna", label: "Europe/Vienna (CET)" },
  { value: "Europe/Zurich", label: "Europe/Zurich (CET)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (CET)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "UTC", label: "UTC" },
]

// Module color mapping for pills
const MODULE_COLORS: Record<string, string> = {
  time_tracking: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sprints: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  story_points: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  epics: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  phases: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  custom_fields: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

function getModuleLabel(key: string): string {
  return AVAILABLE_MODULES.find((m) => m.key === key)?.label || key
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SpacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [createOpen, setCreateOpen] = useState(false)
  const [configureTarget, setConfigureTarget] = useState<CompanyLocation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompanyLocation | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => locationsApi.list({ limit: 100, includeInactive: true }),
  })

  const { data: workflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })

  const locations = data?.data || []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      setDeleteTarget(null)
      notify.success(t("locations.toast.deactivated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.deactivateFailed")),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => locationsApi.update(id, { isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("locations.toast.reactivated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.reactivateFailed")),
  })

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("locations.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("locations.subtitle")}
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => setCreateOpen(true)} className="h-10 gap-2 rounded-xl shadow-sm">
                <Plus className="h-4 w-4" />
                {t("locations.newSpace")}
              </Button>
            )}
          </div>
        </div>

        {/* Space Cards */}
        {isLoading ? (
          <div className="grid gap-4 animate-in fade-in duration-300">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative overflow-hidden rounded-lg bg-muted size-10 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                    <div className="space-y-1.5">
                      <div className="relative overflow-hidden rounded bg-muted h-4 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" style={{ width: `${100 + i * 30}px` }} />
                      <div className="relative overflow-hidden rounded bg-muted h-3 w-48 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-full bg-muted h-6 w-16 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  {Array.from({ length: 3 + i }).map((_, j) => (
                    <div key={j} className="relative overflow-hidden rounded-full bg-muted h-5 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" style={{ width: `${50 + j * 15}px` }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="relative overflow-hidden rounded-full bg-muted size-7 -ml-1 first:ml-0 ring-2 ring-card before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                  ))}
                  <div className="relative overflow-hidden rounded bg-muted h-3 w-20 ml-2 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                </div>
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <EmptyState onCreateClick={() => setCreateOpen(true)} isAdmin={isAdmin} />
        ) : (
          <div className="grid gap-4">
            {locations.map((location, index) => (
              <SpaceCard
                key={location.id}
                space={location}
                workflows={workflows || []}
                isAdmin={isAdmin}
                index={index}
                onConfigure={() => setConfigureTarget(location)}
                onDelete={() => setDeleteTarget(location)}
                onReactivate={() => reactivateMutation.mutate(location.id)}
                onViewTasks={() => router.push(`/tasks?space=${location.id}`)}
              />
            ))}
          </div>
        )}

        {/* Create Space Dialog */}
        <CreateSpaceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["locations"] })
            setCreateOpen(false)
          }}
        />

        {/* Configure Space Dialog */}
        {configureTarget && (
          <ConfigureSpaceDialog
            space={configureTarget}
            workflows={workflows || []}
            open={!!configureTarget}
            onOpenChange={(open) => { if (!open) setConfigureTarget(null) }}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["locations"] })
              setConfigureTarget(null)
            }}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("locations.deactivateSpace")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("locations.deactivateConfirmBefore")}<strong>{deleteTarget?.name}</strong>{t("locations.deactivateConfirmAfter")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              >
                {t("locations.deactivate")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ onCreateClick, isAdmin }: { onCreateClick: () => void; isAdmin: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl bg-muted/50 p-5 mb-5">
        <Building2 className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{t("locations.empty.title")}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {t("locations.empty.description")}
      </p>
      {isAdmin && (
        <Button onClick={onCreateClick} className="mt-6 gap-2">
          <Plus className="h-4 w-4" />
          {t("locations.createSpace")}
        </Button>
      )}
    </div>
  )
}

// ============================================================================
// SPACE CARD
// ============================================================================

const SpaceCard = memo(function SpaceCard({
  space,
  workflows,
  isAdmin,
  index,
  onConfigure,
  onDelete,
  onReactivate,
  onViewTasks,
}: {
  space: CompanyLocation
  workflows: StatusWorkflow[]
  isAdmin: boolean
  index: number
  onConfigure: () => void
  onDelete: () => void
  onReactivate: () => void
  onViewTasks: () => void
}) {
  const { t } = useTranslation()
  const { data: assignments } = useQuery({
    queryKey: ["location-assignments", space.id],
    queryFn: () => locationsApi.getAssignedMembers(space.id),
    enabled: space.isActive,
  })

  const memberCount = assignments?.length || 0
  const enabledModules = space.enabledModules || []
  const workflow = workflows.find((w) => w.id === space.workflowId) || workflows.find((w) => w.isDefault)
  const statusCount = workflow?.statuses?.length || 0

  return (
    <div
      className={`rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md ${
        !space.isActive ? "opacity-60" : ""
      }`}
      style={{ animationDelay: `${index * 50}ms`, animation: "fadeInUp 0.3s ease-out forwards", opacity: 0 }}
    >
      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top: Name + Status + Member count */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-semibold text-foreground truncate">{space.name}</h3>
            <Badge
              variant="outline"
              className={`text-xs font-medium ${
                space.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-border text-muted-foreground"
              }`}
            >
              {space.isActive ? t("common.active") : t("common.inactive")}
            </Badge>
            {memberCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t("locations.memberCount", { count: memberCount })}
              </span>
            )}
          </div>

          {/* Address */}
          {space.address && (
            <p className="text-sm text-muted-foreground mt-1 truncate">{space.address}</p>
          )}

          {/* Modules row */}
          {enabledModules.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {enabledModules.map((mod) => (
                <span
                  key={mod}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                    MODULE_COLORS[mod] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {getModuleLabel(mod)}
                </span>
              ))}
            </div>
          )}

          {/* Workflow info */}
          {workflow && (
            <p className="text-xs text-muted-foreground mt-2">
              {t("locations.workflowPrefix")}{workflow.name}{statusCount > 0 ? t("locations.statusCountSuffix", { count: statusCount }) : ""}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {space.isActive && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs rounded-lg"
                onClick={onConfigure}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t("locations.configure")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                onClick={onViewTasks}
              >
                {t("locations.viewTasks")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {space.isActive ? (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                    <ToggleLeft className="mr-2 h-4 w-4" />
                    {t("locations.deactivate")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onReactivate} className="text-emerald-600 focus:text-emerald-600">
                    <ToggleRight className="mr-2 h-4 w-4" />
                    {t("locations.reactivate")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// CREATE SPACE DIALOG
// ============================================================================

function CreateSpaceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("locations.createSpace")}</DialogTitle>
          <DialogDescription>
            {t("locations.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <SpaceForm
          onCreated={() => { onOpenChange(false); onSuccess() }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// CONFIGURE SPACE DIALOG (full config with tabs)
// ============================================================================

function ConfigureSpaceDialog({
  space,
  workflows,
  open,
  onOpenChange,
  onSuccess,
}: {
  space: CompanyLocation
  workflows: StatusWorkflow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("general")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("locations.configureTitle", { name: space.name })}</DialogTitle>
          <DialogDescription>
            {t("locations.configureDescription")}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">{t("locations.tabs.general")}</TabsTrigger>
            <TabsTrigger value="modules">{t("locations.tabs.modules")}</TabsTrigger>
            <TabsTrigger value="workflow">{t("locations.tabs.workflow")}</TabsTrigger>
            <TabsTrigger value="members">{t("locations.tabs.members")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <GeneralTab space={space} onSuccess={onSuccess} />
          </TabsContent>

          <TabsContent value="modules" className="mt-4">
            <ModulesTab space={space} onSuccess={onSuccess} />
          </TabsContent>

          <TabsContent value="workflow" className="mt-4">
            <WorkflowTab space={space} workflows={workflows} onSuccess={onSuccess} />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersTab space={space} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ---- General Tab ----

function GeneralTab({ space, onSuccess }: { space: CompanyLocation; onSuccess: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(space.name)
  const [address, setAddress] = useState(space.address || "")
  const [lat, setLat] = useState<number | null>(space.lat ?? null)
  const [lng, setLng] = useState<number | null>(space.lng ?? null)
  const [radius, setRadius] = useState(space.geofenceRadius.toString())
  const [timezone, setTimezone] = useState(space.timezone || "Europe/Berlin")
  const [isActive, setIsActive] = useState(space.isActive)

  // Physical spaces (those with coordinates) get the map; logical workspaces don't.
  const isPhysical = space.lat != null && space.lng != null
  const clampRadius = () => Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT))

  const mutation = useMutation({
    mutationFn: (data: UpdateLocationInput) => locationsApi.update(space.id, data),
    onSuccess: () => {
      notify.success(t("locations.toast.updated"))
      onSuccess()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.updateFailed")),
  })

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("locations.nameRequired"))
    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      geofenceRadius: clampRadius(),
      timezone,
      isActive,
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cfg-name">{t("locations.name")}</Label>
        <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {isPhysical ? (
        // Same map picker as the New-Space form (address + map + coordinates).
        <LocationPicker
          lat={lat}
          lng={lng}
          radius={clampRadius()}
          address={address}
          onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng) }}
          onAddressChange={setAddress}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="cfg-address">{t("locations.address")}</Label>
          <Input id="cfg-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cfg-radius">{t("locations.geofenceRadius")}</Label>
          <div className="flex items-center gap-2">
            <Input id="cfg-radius" type="number" min={GEO_MIN} max={GEO_MAX} value={radius} onChange={(e) => setRadius(e.target.value)} className="w-24" />
            <span className="text-sm text-muted-foreground">{radius}m</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cfg-timezone">{t("locations.timezone")}</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("locations.activeHint")}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending} size="sm">
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  )
}

// ---- Modules Tab ----

function ModulesTab({ space, onSuccess }: { space: CompanyLocation; onSuccess: () => void }) {
  const { t } = useTranslation()
  const [enabledModules, setEnabledModules] = useState<string[]>(space.enabledModules || [])
  const [hasChanges, setHasChanges] = useState(false)

  const mutation = useMutation({
    mutationFn: (modules: string[]) => locationsApi.update(space.id, { enabledModules: modules }),
    onSuccess: () => {
      notify.success(t("locations.toast.modulesUpdated"))
      setHasChanges(false)
      onSuccess()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.modulesUpdateFailed")),
  })

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => {
      const next = prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
      setHasChanges(true)
      return next
    })
  }

  const applyPreset = (modules: string[]) => {
    setEnabledModules([...modules])
    setHasChanges(true)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("locations.modulesIntro")}
      </p>

      {/* Presets — one click to set a sensible bundle */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("locations.presets")}</p>
        <div className="flex flex-wrap gap-1.5">
          {MODULE_PRESETS.map((p) => {
            const active =
              p.modules.length === enabledModules.length &&
              p.modules.every((m) => enabledModules.includes(m))
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.modules)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grouped modules with a one-line description per group */}
      {MODULE_GROUPS.map((grp) => (
        <div key={grp.key} className="space-y-2">
          <div className="px-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grp.label}</p>
            <p className="text-[11px] text-muted-foreground/70">{grp.description}</p>
          </div>
          {AVAILABLE_MODULES.filter((m) => m.group === grp.key).map((mod) => {
            const isEnabled = enabledModules.includes(mod.key)
            return (
              <label
                key={mod.key}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  isEnabled
                    ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <span className="text-sm font-medium text-foreground">{mod.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                </div>
                <div className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleModule(mod.key)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </div>
              </label>
            )
          })}
        </div>
      ))}

      {hasChanges && (
        <div className="flex justify-end pt-2">
          <Button onClick={() => mutation.mutate(enabledModules)} disabled={mutation.isPending} size="sm">
            {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---- Workflow Tab ----

function WorkflowTab({
  space,
  workflows,
  onSuccess,
}: {
  space: CompanyLocation
  workflows: StatusWorkflow[]
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentWorkflow = workflows.find((w) => w.id === space.workflowId) || workflows.find((w) => w.isDefault)
  const [selectedId, setSelectedId] = useState(currentWorkflow?.id || "")
  const [editMode, setEditMode] = useState(false)
  const [showCreateBuilder, setShowCreateBuilder] = useState(false)
  const hasChanges = selectedId !== (currentWorkflow?.id || "")

  const mutation = useMutation({
    mutationFn: (wfId: string) => locationsApi.update(space.id, { workflowId: wfId }),
    onSuccess: () => {
      notify.success(t("locations.toast.workflowUpdated"))
      onSuccess()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.workflowUpdateFailed")),
  })

  const previewWorkflow = workflows.find((w) => w.id === selectedId)

  return (
    <div className="space-y-4">
      {/* Workflow selector */}
      <WorkflowSelector
        value={selectedId}
        onChange={(id) => {
          setSelectedId(id)
          setEditMode(false)
          setShowCreateBuilder(false)
        }}
        workflows={workflows}
        allowCreate={false}
        label={t("locations.currentWorkflow")}
      />

      {/* Status preview */}
      {previewWorkflow?.statuses && previewWorkflow.statuses.length > 0 && !editMode && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("locations.statusesWithCount", { count: previewWorkflow.statuses.length })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {previewWorkflow.statuses
              .sort((a, b) => a.position - b.position)
              .map((status) => (
                <span
                  key={status.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-muted text-foreground"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                  {status.isFinal && !status.isCanceled && (
                    <span className="text-[10px] text-emerald-600 ml-0.5">{t("workflows.final")}</span>
                  )}
                  {status.isCanceled && (
                    <span className="text-[10px] text-red-500 ml-0.5">{t("workflows.canceled")}</span>
                  )}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Edit / Create buttons */}
      {!editMode && !showCreateBuilder && (
        <div className="flex items-center gap-2">
          {previewWorkflow && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setEditMode(true)}
            >
              {t("locations.editWorkflow")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowCreateBuilder(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t("locations.createNew")}
          </Button>
          {hasChanges && (
            <Button
              onClick={() => mutation.mutate(selectedId)}
              disabled={mutation.isPending}
              size="sm"
              className="ml-auto"
            >
              {mutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          )}
        </div>
      )}

      {/* Inline edit builder */}
      {editMode && previewWorkflow && (
        <WorkflowBuilder
          mode="edit"
          workflowId={previewWorkflow.id}
          workflowName={previewWorkflow.name}
          initialStatuses={previewWorkflow.statuses}
          onSaved={() => {
            setEditMode(false)
            queryClient.invalidateQueries({ queryKey: ["workflows"] })
            onSuccess()
          }}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* Inline create builder */}
      {showCreateBuilder && (
        <WorkflowBuilder
          mode="create"
          onCreated={(newId) => {
            setSelectedId(newId)
            setShowCreateBuilder(false)
          }}
          onCancel={() => setShowCreateBuilder(false)}
        />
      )}
    </div>
  )
}

// ---- Members Tab ----

function MembersTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const dayLabels: Record<string, string> = {
    MON: t("common.weekdaysShort.mon"),
    TUE: t("common.weekdaysShort.tue"),
    WED: t("common.weekdaysShort.wed"),
    THU: t("common.weekdaysShort.thu"),
    FRI: t("common.weekdaysShort.fri"),
    SAT: t("common.weekdaysShort.sat"),
    SUN: t("common.weekdaysShort.sun"),
  }
  const queryClient = useQueryClient()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>([...DAYS])

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["location-assignments", space.id],
    queryFn: () => locationsApi.getAssignedMembers(space.id),
  })

  const { data: employeeData } = useQuery({
    queryKey: ["employees-for-assign"],
    queryFn: () => employeesApi.list({ limit: 100, status: "active" }),
  })

  const assignedIds = new Set((assignments || []).map((a) => a.userId))
  const availableEmployees = (employeeData?.data || []).filter((t) => !assignedIds.has(t.id))

  const assignMutation = useMutation({
    mutationFn: (data: AssignMemberInput) => locationsApi.assignMember(space.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-assignments", space.id] })
      notify.success(t("locations.toast.memberAdded"))
      setSelectedEmployeeId("")
      setIsPrimary(false)
      setSelectedDays([...DAYS])
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.memberAddFailed")),
  })

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => locationsApi.removeAssignment(space.id, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-assignments", space.id] })
      notify.success(t("locations.toast.memberRemoved"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.memberRemoveFailed")),
  })

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const handleAssign = () => {
    if (!selectedEmployeeId) return notify.error(t("locations.selectEmployeeError"))
    assignMutation.mutate({
      userId: selectedEmployeeId,
      isPrimary,
      schedule: selectedDays.length === 7 ? undefined : selectedDays,
    })
  }

  return (
    <div className="space-y-4">
      {/* Current members */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t("locations.membersWithCount", { count: assignments?.length || 0 })}
        </p>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !assignments || assignments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground rounded-lg border border-dashed">
            {t("locations.noMembers")}
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {a.user?.firstName} {a.user?.lastName}
                    </span>
                    {a.isPrimary && (
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs dark:bg-emerald-950 dark:text-emerald-300">
                        {t("locations.primary")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.schedule && a.schedule.length > 0 && a.schedule.length < 7
                      ? a.schedule.map((d) => dayLabels[d] || d).join(", ")
                      : t("locations.allDays")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-600"
                  onClick={() => removeMutation.mutate(a.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Add member */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" />
          {t("locations.addMember")}
        </p>
        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
          <SelectTrigger>
            <SelectValue placeholder={t("locations.selectEmployee")} />
          </SelectTrigger>
          <SelectContent>
            {availableEmployees.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                {t("locations.noAvailableEmployees")}
              </div>
            ) : (
              availableEmployees.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* Schedule Days */}
        <div className="space-y-2">
          <Label className="text-xs">{t("locations.workDays")}</Label>
          <div className="flex gap-1">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  selectedDays.includes(day)
                    ? "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {dayLabels[day]}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="rounded border-border text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-muted-foreground">{t("locations.setPrimary")}</span>
        </label>

        <Button
          onClick={handleAssign}
          disabled={!selectedEmployeeId || assignMutation.isPending}
          size="sm"
          className="w-full"
        >
          {assignMutation.isPending ? t("locations.adding") : t("locations.addMember")}
        </Button>
      </div>
    </div>
  )
}
