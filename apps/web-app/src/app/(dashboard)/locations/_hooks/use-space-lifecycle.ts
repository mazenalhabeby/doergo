"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"

/**
 * The single source of truth for space lifecycle actions (DRY):
 *   archive — deactivate, keeps all history, reversible (isActive: false)
 *   restore — reactivate an archived space (isActive: true)
 *   purge   — permanent delete, empty spaces only (server-guarded)
 *
 * Every surface (list dropdown, settings danger zone, …) uses this hook so the
 * behavior, cache invalidation, and toast copy stay identical everywhere.
 * Unified vocabulary: Active / Archived, actions Archive / Restore / Delete permanently.
 */
export function useSpaceLifecycle(handlers?: {
  onArchived?: () => void
  onRestored?: () => void
  onPurged?: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const invalidate = () => {
    // Both cache families: the spaces list (["locations", …]) and the
    // per-space detail used by the settings page (["location", id]).
    queryClient.invalidateQueries({ queryKey: ["locations"] })
    queryClient.invalidateQueries({ queryKey: ["location"] })
  }

  const archive = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.archived", "Workspace archived"))
      handlers?.onArchived?.()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.archiveFailed", "Could not archive the workspace")),
  })

  const restore = useMutation({
    mutationFn: (id: string) => locationsApi.update(id, { isActive: true }),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.restored", "Workspace restored"))
      handlers?.onRestored?.()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.restoreFailed", "Could not restore the workspace")),
  })

  const purge = useMutation({
    mutationFn: (id: string) => locationsApi.purge(id),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.purged", "Workspace permanently deleted"))
      handlers?.onPurged?.()
    },
    // The server names exactly what blocks deletion (tasks, attendance, …).
    onError: (err: Error) => notify.error(err.message || t("locations.toast.purgeFailed", "Could not delete workspace")),
  })

  return { archive, restore, purge }
}
