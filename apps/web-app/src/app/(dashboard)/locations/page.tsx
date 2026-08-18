"use client"

import { useState, memo } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Plus,
  MoreHorizontal,
  Users,
  Settings2,
  ToggleRight,
  ToggleLeft,
  Building2,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  Handshake,
  Briefcase,
  Share2,
  Check,
  X,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { AVAILABLE_MODULES } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceLifecycle } from "./_hooks/use-space-lifecycle"
import {
  locationsApi,
  workflowsApi,
  spaceSharingApi,
  type CompanyLocation,
  type StatusWorkflow,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SpaceForm } from "./_components/space-form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  const [deleteTarget, setDeleteTarget] = useState<CompanyLocation | null>(null)
  const [resyncAllOpen, setResyncAllOpen] = useState(false)

  const { data, isLoading } = useQuery({
    // The Spaces directory shows EVERY kind (incl. customer companies); work
    // pickers elsewhere default to hiding CUSTOMER.
    queryKey: ["locations", "all"],
    queryFn: () => locationsApi.list({ limit: 100, includeInactive: true, kind: "all" }),
  })

  const { data: workflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  })

  const locations = data?.data || []

  // Unified space lifecycle (archive / restore) — shared with the settings danger zone.
  const lifecycle = useSpaceLifecycle({ onArchived: () => setDeleteTarget(null) })

  // Re-sync EVERY space's tasks onto their workflows in one action.
  const resyncAllMutation = useMutation({
    mutationFn: () => locationsApi.resyncAllTasks(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
      setResyncAllOpen(false)
      notify.success(
        t("locations.toast.resyncAllDone", { updated: res?.updated ?? 0, spaces: res?.spacesProcessed ?? 0 }),
      )
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.resyncFailed")),
  })

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div data-tour="spaces-intro">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("locations.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("locations.subtitle")}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setResyncAllOpen(true)}
                  disabled={resyncAllMutation.isPending}
                  className="h-10 gap-2 rounded-xl"
                  title={t("locations.resyncAllTasksHint")}
                >
                  {resyncAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="hidden sm:inline">{t("locations.resyncAllTasks")}</span>
                </Button>
                <Button onClick={() => setCreateOpen(true)} data-tour="spaces-create" className="h-10 gap-2 rounded-xl shadow-sm">
                  <Plus className="h-4 w-4" />
                  {t("locations.newSpace")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Cross-org: invites received + spaces shared with us */}
        <SharedWithUsSection />

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
                onDelete={() => setDeleteTarget(location)}
                onReactivate={() => lifecycle.restore.mutate(location.id)}
                onViewTasks={() => router.push(`/tasks?space=${location.id}`)}
                onOpenSettings={() => router.push(`/locations/${location.id}`)}
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

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("locations.danger.dialogTitle", { name: deleteTarget?.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t("locations.danger.dialogDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && lifecycle.archive.mutate(deleteTarget.id)}
              >
                {t("locations.danger.confirmButton")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Re-sync all spaces confirmation */}
        <AlertDialog open={resyncAllOpen} onOpenChange={setResyncAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("locations.resyncAllTasksConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("locations.resyncAllTasksConfirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resyncAllMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); resyncAllMutation.mutate() }}
                disabled={resyncAllMutation.isPending}
              >
                {resyncAllMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("locations.resyncAllTasks")}
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
  onDelete,
  onReactivate,
  onViewTasks,
  onOpenSettings,
}: {
  space: CompanyLocation
  workflows: StatusWorkflow[]
  isAdmin: boolean
  index: number
  onDelete: () => void
  onReactivate: () => void
  onViewTasks: () => void
  onOpenSettings: () => void
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
      data-tour={index === 0 ? "spaces-card" : undefined}
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
              {space.isActive ? t("common.active") : t("locations.archived", "Archived")}
            </Badge>
            {/* Ownership kind — badge the non-default kinds (COMPANY is implicit). */}
            {space.kind === "CUSTOMER" && (
              <Badge variant="outline" className="gap-1 text-xs font-medium border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <Handshake className="h-3 w-3" />
                {t("locations.form.kindCustomer", "Customer company")}
              </Badge>
            )}
            {space.kind === "PROJECT" && (
              <Badge variant="outline" className="gap-1 text-xs font-medium border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                <Briefcase className="h-3 w-3" />
                {t("locations.form.kindProject", "My project")}
              </Badge>
            )}
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
                data-tour={index === 0 ? "spaces-card-configure" : undefined}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs rounded-lg"
                onClick={onOpenSettings}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t("locations.configure")}
              </Button>
              <Button
                data-tour={index === 0 ? "spaces-card-viewtasks" : undefined}
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
                <Button data-tour={index === 0 ? "spaces-card-actions" : undefined} variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpenSettings}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  {t("locations.spaceSettings")}
                </DropdownMenuItem>
                {space.isActive ? (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                    <ToggleLeft className="mr-2 h-4 w-4" />
                    {t("locations.archiveAction", "Archive")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onReactivate} className="text-emerald-600 focus:text-emerald-600">
                    <ToggleRight className="mr-2 h-4 w-4" />
                    {t("locations.restoreAction", "Restore")}
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
// SHARED WITH US — cross-org invites + active shared spaces (guest side)
// ============================================================================

const LEVEL_BADGE: Record<string, string> = {
  VIEW: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CONTRIBUTE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CONTROL: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
}

function SharedWithUsSection() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()

  // Active shared spaces come from the auth context (no fetch). Pending invites
  // are fetched: /shared-spaces returns both PENDING and ACTIVE — filter here.
  const activeShared = user?.access?.sharedSpaces || []

  const { data: sharedSpaces } = useQuery({
    queryKey: ["shared-spaces"],
    queryFn: () => spaceSharingApi.listSharedSpaces(),
  })
  const pending = (sharedSpaces || []).filter((s) => s.status === "PENDING")

  const respondMutation = useMutation({
    mutationFn: ({ shareId, accept }: { shareId: string; accept: boolean }) =>
      spaceSharingApi.respondToShare(shareId, accept),
    onSuccess: (_res, { accept }) => {
      queryClient.invalidateQueries({ queryKey: ["shared-spaces"] })
      // Full access (auth context sharedSpaces) refreshes after /auth/me reloads.
      if (accept) void refreshUser()
      notify.success(accept ? t("spaceSharing.toast.inviteAccepted") : t("spaceSharing.toast.inviteDeclined"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.respondFailed")),
  })

  if (pending.length === 0 && activeShared.length === 0) return null

  return (
    <div className="mb-8 space-y-6">
      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                  <Share2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t("spaceSharing.guest.inviteTitle", { space: invite.spaceName, org: invite.ownerOrgName })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`spaceSharing.levels.${invite.level}.description`)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => respondMutation.mutate({ shareId: invite.id, accept: true })}
                  disabled={respondMutation.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("spaceSharing.guest.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => respondMutation.mutate({ shareId: invite.id, accept: false })}
                  disabled={respondMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("spaceSharing.guest.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active shared spaces */}
      {activeShared.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.sharedWithUs")}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeShared.map((s) => (
              <button
                key={s.spaceId}
                type="button"
                onClick={() => router.push(`/shared/${s.spaceId}`)}
                className="text-left rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground truncate">{s.spaceName}</h3>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="gap-1 text-xs font-medium border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        <Handshake className="h-3 w-3" />
                        {t("spaceSharing.guest.sharedFrom", { org: s.ownerOrgName })}
                      </Badge>
                      <Badge variant="outline" className={`text-xs font-medium ${LEVEL_BADGE[s.level] || LEVEL_BADGE.VIEW}`}>
                        {t(`spaceSharing.levels.${s.level}.label`)}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
