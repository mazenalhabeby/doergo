"use client"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { canManageSpace } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { useSpaceLifecycle } from "./_hooks/use-space-lifecycle"
import { SpaceLifecycleDialog } from "./_components/space-lifecycle-dialog"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useBillingLock } from "@/hooks/use-billing-lock"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/page/page-kit"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { EmptyState, SpaceCard } from "./_components/space-card"
import { SharedWithUsSection } from "./_components/shared-with-us-section"
import { WorkspaceFilters, type WorkspaceFilter } from "./_components/workspace-filters"
import dynamic from "next/dynamic"
import { useLatched } from "@/hooks/use-latched"
import { useWorkflows } from "@/hooks/use-workflows"

// The create dialog carries the whole space form (workflow builder included); downloaded on first open.
const CreateSpaceDialog = dynamic(() => import("./_components/create-space-dialog").then((m) => m.CreateSpaceDialog), {
  ssr: false,
})

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
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<WorkspaceFilter>("all")

  // The Spaces page shows EVERY kind and archived ones too — the whole directory.
  const { data: directory, isLoading } = useSpaceDirectory()

  // GET /workflows is @RequirePermission('canViewAllTasks') — asked only of whoever holds it.
  const { holds } = useRouteAccess()
  const { data: workflows } = useWorkflows({ enabled: holds("org:canViewAllTasks") })

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

  const needle = query.trim().toLowerCase()
  const shown = locations.filter(
    (l) =>
      (filter === "all" || (filter === "active" ? l.isActive : !l.isActive)) &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.address ?? "").toLowerCase().includes(needle)),
  )

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        <PageHeader
          tour="spaces-intro"
          title={t("locations.title")}
          subtitle={t("locations.subtitle")}
          actions={
            isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="pill"
                  onClick={() => setResyncAllOpen(true)}
                  disabled={resyncAllMutation.isPending}
                  title={t("locations.resyncAllTasksHint")}
                >
                  {resyncAllMutation.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Icon name="refreshLine" size={16} />
                  )}
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
                  size="pillLg"
                  disabled={billingLocked}
                  title={billingLocked ? billingLockReason : undefined}
                  onClick={() => setCreateOpen(true)}
                  data-tour="spaces-create"
                >
                  <Icon name="plus" size={16} />
                  {t("locations.newSpace")}
                </Button>
              </>
            )
          }
        />

        {/* Cross-org: invites received + spaces shared with us */}
        <SharedWithUsSection />

        {/* Space Cards */}
        {isLoading ? (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-card p-[18px] shadow-shell"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-11 rounded-[14px]" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4" style={{ width: `${100 + i * 30}px` }} />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
                <Skeleton className="mt-2 h-8 w-32 rounded-full" />
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <EmptyState
            onCreateClick={() => setCreateOpen(true)}
            isAdmin={isAdmin}
            locked={billingLocked}
            lockReason={billingLockReason}
          />
        ) : (
          <>
            <WorkspaceFilters query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} />
            {shown.length === 0 && <p className="px-1 py-6 text-sm text-muted-foreground">{t("common.noResults")}</p>}
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr))]">
              {shown.map((location, index) => (
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
          </>
        )}

        {/* Create Space Dialog */}
        {createMounted && (
          <CreateSpaceDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
              setCreateOpen(false)
            }}
          />
        )}

        {/* Archive confirmation — same type-to-confirm dialog as space settings. */}
        <SpaceLifecycleDialog
          space={archiveTarget}
          mode="archive"
          open={!!archiveTarget}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null)
          }}
          taskCount={archiveTarget?._count?.tasks ?? 0}
        />

        {/* Re-sync all spaces confirmation */}
        <ConfirmDialog
          open={resyncAllOpen}
          onOpenChange={setResyncAllOpen}
          title={t("locations.resyncAllTasksConfirmTitle")}
          description={t("locations.resyncAllTasksConfirmDescription")}
          confirmLabel={t("locations.resyncAllTasks")}
          onConfirm={(e) => {
            e.preventDefault()
            resyncAllMutation.mutate()
          }}
          pending={resyncAllMutation.isPending}
        />
      </div>
    </div>
  )
}
