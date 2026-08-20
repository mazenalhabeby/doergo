"use client"

import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Package, Plus, Pencil, Trash2 } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "./section-header"
import { AssetKindDialog } from "./asset-kind-dialog"

/**
 * What this space owns.
 *
 * The kinds belong to the SPACE: this office's "Apartments" and the depot's
 * "Vehicles" are separate lists. Adding the individual ones inside a kind is
 * the next step; this screen is where the kinds are set up.
 */
export function AssetsTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const kindsQ = useQuery({
    queryKey: ["space-asset-kinds", spaceId],
    queryFn: () => assetsApi.getCategories(spaceId),
  })
  const kinds = kindsQ.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-asset-kinds", spaceId] })

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteCategory(id),
    onSuccess: () => { notify.success(t("assetKinds.removed", "Removed")); invalidate() },
    onError: (err: Error) => notify.error(err?.message || t("assetKinds.removeFailed", "Could not remove this kind")),
  })

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Package}
        accent="sky"
        title={t("assetKinds.title", "Assets")}
        description={t(
          "assetKinds.intro",
          "What this space owns — apartments, vehicles, machines. Set up a kind here, then add the ones you have inside it.",
        )}
        action={
          <AssetKindDialog
            spaceId={spaceId}
            onSaved={invalidate}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> {t("assetKinds.add", "New kind")}
              </Button>
            }
          />
        }
      />

      {kindsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : kinds.length === 0 ? (
        <EmptyState icon={Package} title={t("assetKinds.empty", "No kinds yet")} />
      ) : (
        <div className="space-y-2">
          {kinds.map((kind: AssetCategory) => (
            <div
              key={kind.id}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-lg">
                {kind.icon || "📦"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{kind.name}</p>
                {kind.description && (
                  <p className="truncate text-xs text-muted-foreground">{kind.description}</p>
                )}
              </div>
              <Badge variant="outline" className="text-muted-foreground">
                {t("assetKinds.count", "{{count}} inside", { count: kind._count?.assets ?? 0 })}
              </Badge>
              <AssetKindDialog
                spaceId={spaceId}
                existing={kind}
                onSaved={invalidate}
                trigger={
                  <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                }
              />
              <button
                onClick={() => del.mutate(kind.id)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
