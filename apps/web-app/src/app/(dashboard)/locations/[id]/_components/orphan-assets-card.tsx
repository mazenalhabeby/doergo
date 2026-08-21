"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowRight, Loader2, Trash2 } from "lucide-react"

import { assetsApi, type AssetCategory, type OrphanAsset } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

/**
 * The assets no space can show.
 *
 * A type carries the space and an asset reaches its space through its type, so
 * an asset whose type has no space — rows made before types were space-scoped,
 * or one whose type was later deleted — appears on no Assets tab at all. It is
 * still a real record, still linked to its tasks, and still counted on the
 * bill. Invisible and chargeable is the worst pair of properties a record can
 * have, so this puts them back within reach: move each one into a type here, or
 * delete it.
 *
 * Shown on every space because they belong to none, and hidden the moment the
 * list is empty — a banner about a problem nobody has is just noise.
 */
export function OrphanAssetsCard({ spaceId, types }: { spaceId: string; types: AssetCategory[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const orphansQ = useQuery({ queryKey: ["orphan-assets"], queryFn: () => assetsApi.getOrphans() })
  const orphans = orphansQ.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["orphan-assets"] })
    qc.invalidateQueries({ queryKey: ["space-asset-kinds", spaceId] })
    qc.invalidateQueries({ queryKey: ["asset-usage", spaceId] })
  }

  const move = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string }) =>
      // Moving means changing the TYPE, because the type is what carries the
      // space. Dropping the old type id too: it belonged to the type that was
      // left behind, and keeping it would point the record at two of them.
      assetsApi.updateAsset(id, { categoryId, typeId: null }),
    onSuccess: () => { notify.success(t("orphanAssets.moved", "Moved into this space")); refresh() },
    onError: (e: Error) => notify.error(e?.message || t("orphanAssets.moveFailed", "Could not move this asset")),
  })

  const remove = useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => { notify.success(t("orphanAssets.deleted", "Deleted")); refresh() },
    onError: (e: Error) => notify.error(e?.message || t("orphanAssets.deleteFailed", "Could not delete this asset")),
  })

  if (orphansQ.isLoading || orphans.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t("orphanAssets.title", "{{count}} asset is not in any space", { count: orphans.length })}
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
              {t(
                "orphanAssets.subtitle",
                "They appear on no Assets tab, but they still count towards what you pay. Move them here or delete them.",
              )}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
          {t("orphanAssets.review", "Review them")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("orphanAssets.dialogTitle", "Assets without a space")}</DialogTitle>
            <DialogDescription>
              {types.length > 0
                ? t("orphanAssets.dialogHint", "Pick a type to move an asset into this space, or delete it. Its history and tasks come with it.")
                : t("orphanAssets.noTypes", "This space has no asset types yet. Create one first, or delete these records.")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {orphans.map((asset) => (
              <OrphanRow
                key={asset.id}
                asset={asset}
                types={types}
                busy={
                  (move.isPending && move.variables?.id === asset.id) ||
                  (remove.isPending && remove.variables === asset.id)
                }
                onMove={(categoryId) => move.mutate({ id: asset.id, categoryId })}
                onDelete={() => remove.mutate(asset.id)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function OrphanRow({
  asset, types, busy, onMove, onDelete,
}: {
  asset: OrphanAsset
  types: AssetCategory[]
  busy: boolean
  onMove: (categoryId: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("")
  // Delete asks twice. One click on a bin icon is not enough authority to
  // destroy a record that may carry tasks and parts, and a full confirm dialog
  // on top of this one would be worse — nine of these to clear means nine
  // dialogs to dismiss. The button says what the second click will do.
  const [confirming, setConfirming] = useState(false)

  // What is attached to it. Deleting an asset that carries tasks or parts is a
  // different decision from deleting an empty stub, so the row says which it is
  // rather than making somebody open the record to find out.
  const attached = [
    asset._count.tasks > 0 && t("orphanAssets.taskCount", "{{count}} task", { count: asset._count.tasks }),
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {asset.category?.name ?? t("orphanAssets.noType", "No type")}
          {asset.serialNumber && <span className="ml-1.5 font-mono">{asset.serialNumber}</span>}
          {attached.length > 0 && <span className="ml-1.5 text-amber-600 dark:text-amber-500">· {attached.join(" · ")}</span>}
        </p>
      </div>

      <Select value={target} onValueChange={setTarget} disabled={busy || types.length === 0}>
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue placeholder={t("orphanAssets.moveInto", "Move into…")} />
        </SelectTrigger>
        <SelectContent>
          {types.map((type) => (
            <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button size="sm" className="h-8 gap-1" disabled={!target || busy} onClick={() => onMove(target)}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
        {t("orphanAssets.move", "Move")}
      </Button>
      <Button
        size="sm"
        variant={confirming ? "destructive" : "ghost"}
        className={confirming ? "h-8 gap-1" : "h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"}
        disabled={busy}
        onClick={() => (confirming ? onDelete() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        aria-label={t("common.delete", "Delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {confirming && t("orphanAssets.confirmDelete", "Delete?")}
      </Button>
    </div>
  )
}
