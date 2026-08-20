"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ChevronRight, Package, Plus, Pencil, Trash2, User } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { normalizeKindShape } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "./section-header"
import { AssetKindDialog } from "./asset-kind-dialog"
import { AssetRecordDialog, type AssetRecord } from "@/components/assets/asset-record-dialog"

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
  // Which kind is open. Kept here rather than in the URL because this is a
  // settings pane inside the space, and the tab already owns its own state.
  const [openKindId, setOpenKindId] = useState<string | null>(null)

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

  const openKind = kinds.find((k: AssetCategory) => k.id === openKindId)
  if (openKind) {
    return <KindContents spaceId={spaceId} kind={openKind} onBack={() => setOpenKindId(null)} onChanged={invalidate} />
  }

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
              <button
                onClick={() => setOpenKindId(kind.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                  <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{kind.name}</p>
                  {kind.description && (
                    <p className="truncate text-xs text-muted-foreground">{kind.description}</p>
                  )}
                </div>
              </button>
              <Badge variant="outline" className="text-muted-foreground">
                {t("assetKinds.count", "{{count}} inside", { count: kind._count?.assets ?? 0 })}
              </Badge>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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

/**
 * Everything inside one kind — all the apartments, all the vans.
 *
 * The list stays plain on purpose: a name, who has it, where it is. What each
 * one did belongs on its own record.
 */
function KindContents({
  spaceId, kind, onBack, onChanged,
}: {
  spaceId: string
  kind: AssetCategory
  onBack: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const shape = normalizeKindShape(kind.config)

  const recordsQ = useQuery({
    queryKey: ["asset-records", kind.id],
    queryFn: () => assetsApi.getAssets({ categoryId: kind.id }),
  })

  // The list endpoint has returned both a bare array and a wrapped page, so
  // normalise once rather than guessing at each use.
  const raw = (recordsQ.data as unknown as { data?: unknown })?.data ?? recordsQ.data
  const records: AssetRecord[] = Array.isArray(raw) ? (raw as AssetRecord[]) : []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["asset-records", kind.id] })
    onChanged()
  }

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => { notify.success(t("assetRecords.removed", "Removed")); refresh() },
    onError: (e: Error) => notify.error(e?.message || t("assetRecords.removeFailed", "Could not remove this")),
  })

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("assetKinds.title", "Assets")}
      </button>

      <SectionHeader
        icon={Package}
        accent="sky"
        title={kind.name}
        description={kind.description || t("assetRecords.intro", "Everything of this kind in this space.")}
        action={
          <AssetRecordDialog
            spaceId={spaceId}
            kind={kind}
            onSaved={refresh}
            trigger={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("common.add", "Add")}</Button>}
          />
        }
      />

      {recordsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : records.length === 0 ? (
        <EmptyState icon={Package} title={t("assetRecords.empty", "Nothing added yet")} />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
              <button
                onClick={() => router.push(`/assets/${r.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                  <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{r.name}</p>
                  {r.locationAddress && r.locationAddress !== r.name && (
                    <p className="truncate text-xs text-muted-foreground">{r.locationAddress}</p>
                  )}
                </div>
              </button>
              {shape.holder.enabled && <HolderBadge record={r} />}
              <AssetRecordDialog
                spaceId={spaceId}
                kind={kind}
                existing={r}
                onSaved={refresh}
                trigger={
                  <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                }
              />
              <button onClick={() => del.mutate(r.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Who has this one — or that nobody does. */
function HolderBadge({ record }: { record: AssetRecord }) {
  const { t } = useTranslation()
  if (record.holderUserId || record.customerId) {
    return <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" /> {t("assetRecords.taken", "Taken")}</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">{t("assetRecords.free", "Free")}</Badge>
}
