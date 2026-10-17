"use client"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
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
  Inbox,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { AVAILABLE_MODULES, canManageSpace } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceLifecycle } from "./_hooks/use-space-lifecycle"
import { SpaceLifecycleDialog } from "./_components/space-lifecycle-dialog"
import {
  locationsApi,
  workflowsApi,
  spaceSharingApi,
  type CompanyLocation,
  type StatusWorkflow,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { CenteredNotice } from "@/components/space-page"
import { Badge } from "@/components/ui/badge"
import { useBillingLock } from "@/hooks/use-billing-lock"
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
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { EmptyState, SpaceCard, LEVEL_BADGE } from "./space-card"
import { SharedWithUsSection } from "./shared-with-us-section"
import dynamic from "next/dynamic"
import { useLatched } from "@/hooks/use-latched"

// The create dialog carries the whole space form (workflow builder included); downloaded on first open.
const CreateSpaceDialog = dynamic(() => import("./create-space-dialog").then((m) => m.CreateSpaceDialog), { ssr: false })

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SpacesPage() {
  const { locked: billingLocked, reason: billingLockReason } = useBillingLock()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [createOpen, setCreateOpen] = useState(false)
  const createMounted = useLatched(createOpen)
  const [archiveTarget, setArchiveTarget] = useState<CompanyLocation | null>(null)
  const [resyncAllOpen, setResyncAllOpen] = useState(false)

  // The Spaces page shows EVERY kind and archived ones too — the whole directory.
  const { data: directory, isLoading } = useSpaceDirectory()

  // GET /workflows is @RequirePermission('canViewAllTasks') — asked only of whoever holds it.
  const { holds } = useRouteAccess()
  const { data: workflows } = useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
    enabled: holds("org:canViewAllTasks"),
  })

  const locations = directory ?? []

  // Unified space lifecycle — restore is instant; archive goes through the
  // shared type-to-confirm SpaceLifecycleDialog (same flow as space settings).
  const lifecycle = useSpaceLifecycle()

  // Re-sync EVERY space's tasks onto their workflows in one action.
  const resyncAllMutation = useMutation({
    mutationFn: () => locationsApi.resyncAllTasks(),
    onSuccess: (res) => {
      invalidateTaskLists(queryClient)
      setResyncAllOpen(false)
      notify.success(
        t("locations.toast.resyncAllDone", { updated: res?.updated ?? 0, spaces: res?.spacesProcessed ?? 0 }),
      )
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.resyncFailed")),
  })

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
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
                {/*
                  Disabled while the account is read-only.

                  A workspace is the thing modules are billed AGAINST, so this
                  is the write most worth refusing before the dialog: somebody
                  naming a space and picking its modules, only to be told at
                  submit that nothing can be saved.
                */}
                <Button
                  disabled={billingLocked}
                  title={billingLocked ? billingLockReason : undefined}
                  onClick={() => setCreateOpen(true)}
                  data-tour="spaces-create"
                  className="h-10 gap-2 rounded-xl shadow-sm"
                >
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
                    <div
                      className={"relative overflow-hidden rounded-lg bg-muted size-10 before:absolute " +
                        "before:inset-0 before:-translate-x-full " +
                        "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                        "before:from-transparent before:via-foreground/5 before:to-transparent"}
                    />
                    <div className="space-y-1.5">
                      <div
                        className={"relative overflow-hidden rounded bg-muted h-4 before:absolute " +
                          "before:inset-0 before:-translate-x-full " +
                          "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                          "before:from-transparent before:via-foreground/5 before:to-transparent"}
                        style={{ width: `${100 + i * 30}px` }}
                      />
                      <div
                        className={"relative overflow-hidden rounded bg-muted h-3 w-48 before:absolute " +
                          "before:inset-0 before:-translate-x-full " +
                          "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                          "before:from-transparent before:via-foreground/5 before:to-transparent"}
                      />
                    </div>
                  </div>
                  <div
                    className={"relative overflow-hidden rounded-full bg-muted h-6 w-16 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  {Array.from({ length: 3 + i }).map((_, j) => (
                    <div
                      key={j}
                      className={"relative overflow-hidden rounded-full bg-muted h-5 before:absolute " +
                        "before:inset-0 before:-translate-x-full " +
                        "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                        "before:from-transparent before:via-foreground/5 before:to-transparent"}
                      style={{ width: `${50 + j * 15}px` }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div
                      key={j}
                      className={"relative overflow-hidden rounded-full bg-muted size-7 -ml-1 first:ml-0 " +
                        "ring-2 ring-card before:absolute before:inset-0 before:-translate-x-full " +
                        "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                        "before:from-transparent before:via-foreground/5 before:to-transparent"}
                    />
                  ))}
                  <div
                    className={"relative overflow-hidden rounded bg-muted h-3 w-20 ml-2 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <EmptyState onCreateClick={() => setCreateOpen(true)} isAdmin={isAdmin} locked={billingLocked} lockReason={billingLockReason} />
        ) : (
          <div className="grid gap-4">
            {locations.map((location, index) => (
              <SpaceCard
                key={location.id}
                space={location}
                workflows={workflows || []}
                isAdmin={isAdmin}
                // Per SPACE, not per org: a Space Manager may configure their
                // own space and no other, so one org-wide answer would be
                // wrong in both directions.
                canConfigure={canManageSpace(user, location.id)}
                index={index}
                onDelete={() => setArchiveTarget(location)}
                onReactivate={() => lifecycle.restore.mutate(location.id)}
                onViewTasks={() => router.push(`/tasks?space=${location.id}`)}
                onOpenSettings={() => router.push(`/locations/${location.id}`)}
              />
            ))}
          </div>
        )}

        {/* Create Space Dialog */}
        {createMounted && <CreateSpaceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
            setCreateOpen(false)
          }}
        />}

        {/* Archive confirmation — same type-to-confirm dialog as space settings. */}
        <SpaceLifecycleDialog
          space={archiveTarget}
          mode="archive"
          open={!!archiveTarget}
          onOpenChange={(open) => { if (!open) setArchiveTarget(null) }}
          taskCount={archiveTarget?._count?.tasks ?? 0}
        />

        {/* Re-sync all spaces confirmation */}
        <ConfirmDialog
          open={resyncAllOpen}
          onOpenChange={setResyncAllOpen}
          title={t("locations.resyncAllTasksConfirmTitle")}
          description={t("locations.resyncAllTasksConfirmDescription")}
          confirmLabel={t("locations.resyncAllTasks")}
          onConfirm={(e) => { e.preventDefault(); resyncAllMutation.mutate() }}
          pending={resyncAllMutation.isPending}
        />
      </div>
    </div>
  )
}
