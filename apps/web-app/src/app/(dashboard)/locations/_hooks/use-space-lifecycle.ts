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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["locations"] })

  const archive = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.archived", "Space archived"))
      handlers?.onArchived?.()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.archiveFailed", "Could not archive the space")),
  })

  const restore = useMutation({
    mutationFn: (id: string) => locationsApi.update(id, { isActive: true }),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.restored", "Space restored"))
      handlers?.onRestored?.()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.restoreFailed", "Could not restore the space")),
  })

  const purge = useMutation({
    mutationFn: (id: string) => locationsApi.purge(id),
    onSuccess: () => {
      invalidate()
      notify.success(t("locations.toast.purged", "Space permanently deleted"))
      handlers?.onPurged?.()
    },
    // The server names exactly what blocks deletion (tasks, attendance, …).
    onError: (err: Error) => notify.error(err.message || t("locations.toast.purgeFailed", "Could not delete space")),
  })

  return { archive, restore, purge }
}
