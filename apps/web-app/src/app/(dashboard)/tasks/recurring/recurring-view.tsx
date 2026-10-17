"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Repeat, ChevronLeft } from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { recurringTasksApi, type RecurringTaskTemplate } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { TemplateCard } from "./template-card"
import { TemplateDialog } from "./template-dialog"

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Create/Edit Template Dialog
// ============================================================================

// ============================================================================
// Main Page
// ============================================================================

export function RecurringPanel({
  embedded = false,
  spaceId = null,
}: {
  embedded?: boolean
  /** When set, only show templates that generate into this space. */
  spaceId?: string | null
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringTaskTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTaskTemplate | null>(null)

  const isAdmin = user?.role === "ADMIN"

  /*
    The admin guard runs AFTER every hook, and the redirect is an effect.

    It used to `return null` above the hooks. `user` starts undefined while the
    session loads, so the first render took the early exit and ran three hooks;
    the moment the session arrived and the role was ADMIN, the same component
    rendered seven. React counts hooks by position — that is "Rendered more
    hooks than during the previous render", a hard crash on a screen that
    otherwise looked fine to whoever wrote it.

    Redirecting during render was the second half of the same bug: navigating
    while React is rendering is a side effect in the one place side effects are
    not allowed.
  */
  useEffect(() => {
    if (!isAdmin && !embedded) router.push("/dashboard")
  }, [isAdmin, embedded, router])

  const { data: templates, isLoading } = useQuery({
    queryKey: keys.recurringTasks.lists(),
    queryFn: () => recurringTasksApi.list(),
    // Nothing to fetch for somebody who is about to be sent away.
    enabled: isAdmin,
  })

  // Narrow to the selected space tab (null = all spaces).
  const visibleTemplates = (templates ?? []).filter((t) => !spaceId || t.spaceId === spaceId)

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      recurringTasksApi.update(id, { isActive } as Partial<RecurringTaskTemplate>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.generate(id),
    onSuccess: () => {
      notify.success(t("tasks.recurring.taskGenerated"))
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.delete(id),
    onSuccess: () => {
      notify.success(t("tasks.recurring.templateDeleted"))
      queryClient.invalidateQueries({ queryKey: keys.recurringTasks.lists() })
      setDeleteTarget(null)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (!isAdmin) return null

  return (
    <div className={embedded ? "" : "min-h-full bg-muted/30"}>
      <div className={embedded ? "" : PAGE_SHELL}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {!embedded && (
              <button
                onClick={() => router.push("/tasks")}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("tasks.page.heading")}
              </button>
            )}
            <h1 className="text-2xl font-semibold text-foreground">{t("tasks.recurring.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("tasks.recurring.pageSubtitle")}</p>
          </div>
          <Button
            onClick={() => {
              setEditingTemplate(null)
              setShowDialog(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("tasks.recurring.newTemplate")}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <div className="flex items-center justify-center h-14 w-14 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-900/20 mb-4">
              <Repeat className="h-7 w-7 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {spaceId ? t("tasks.recurring.emptyInSpace") : t("tasks.recurring.emptyTitle")}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">{t("tasks.recurring.emptyHint")}</p>
            <Button
              onClick={() => {
                setEditingTemplate(null)
                setShowDialog(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("tasks.recurring.createFirst")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => {
                  setEditingTemplate(template)
                  setShowDialog(true)
                }}
                onDelete={() => setDeleteTarget(template)}
                onGenerate={() => generateMutation.mutate(template.id)}
                onToggle={(active) => toggleMutation.mutate({ id: template.id, isActive: active })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showDialog && (
        <TemplateDialog
          open={showDialog}
          onOpenChange={(open) => {
            setShowDialog(open)
            if (!open) setEditingTemplate(null)
          }}
          existingTemplate={editingTemplate}
          defaultSpaceId={spaceId}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("tasks.recurring.deleteTitle")}
        description={t("tasks.recurring.deleteDescription", { name: deleteTarget?.title })}
        confirmLabel={t("common.delete")}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        destructive
      />
    </div>
  )
}
