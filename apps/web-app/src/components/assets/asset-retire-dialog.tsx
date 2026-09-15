"use client"

import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Archive, Loader2 } from "lucide-react"

import { assetsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

/**
 * "It cannot be deleted — retire it instead", as a button rather than a sentence.
 *
 * The server refuses to delete a record with jobs in its history and says to
 * retire it. That refusal used to arrive as a toast naming a status nothing on
 * screen could set, so the advice was correct and impossible to follow. The
 * list asks BEFORE the delete when it already knows the count, and this is
 * what it asks.
 */
export function AssetRetireDialog({
  asset,
  onClose,
  onRetired,
}: {
  /** The record being deleted, or null when the dialog is closed. */
  asset: { id: string; name: string; jobs: number } | null
  onClose: () => void
  onRetired: () => void
}) {
  const { t } = useTranslation()

  const retire = useMutation({
    mutationFn: (id: string) => assetsApi.updateAsset(id, { status: "RETIRED" }),
    onSuccess: () => {
      notify.success(t("assetFacts.retire.done", "Retired."))
      onRetired()
      onClose()
    },
    onError: (e: Error) => notify.error(e.message || t("common.saveFailed", "Could not save")),
  })

  return (
    <Dialog open={!!asset} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            {t("assetFacts.retire.title", "Retire instead?")}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{asset?.name}</span>
            {" — "}
            {t(
              "assetFacts.retire.body",
              "This has {{count}} job(s) in its history, so it cannot be deleted. Retiring keeps the record, its jobs, money and custody — it stops counting on the bill and leaves pickers.",
              { count: asset?.jobs ?? 0 },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!asset || retire.isPending} onClick={() => asset && retire.mutate(asset.id)}>
            {retire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("assetFacts.retire.confirm", "Set to Retired")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
