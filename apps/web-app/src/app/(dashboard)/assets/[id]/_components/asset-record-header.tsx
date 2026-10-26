"use client"

import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { MapPin, Package, Settings2 } from "lucide-react"

import type { AssetCategory } from "@/lib/api"
import type { KindShape } from "@hbcfield/shared/client"
import { AssetRecordDialog } from "@/components/assets/asset-record-dialog"
import { AssetRaiseJob } from "@/components/assets/asset-raise-job"
import { AssetInviteClient } from "@/components/assets/asset-invite-client"
import { AssetStatusChip } from "@/components/assets/asset-status"
import { Button } from "@/components/ui/button"
import { keys } from "@/lib/query-keys"
import type { AssetDetail } from "../_lib/asset-detail"

/** The record's title row: its name and status, and what can be done to it. */
export function AssetRecordHeader({
  id,
  asset,
  kind,
  shape,
}: {
  id: string
  asset: AssetDetail
  kind: AssetCategory | undefined
  shape: KindShape
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const holders = asset.holders ?? []

  return (
    <div className="flex items-start gap-4">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-shell-accent-soft text-shell-accent">
        <Package className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[30px]">
            {asset.name}
          </h1>
          <AssetStatusChip status={asset.status} className="text-[11px]" />
        </div>
        {shape.hasAddress && asset.locationAddress && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {asset.locationAddress}
          </p>
        )}
      </div>

      {/* Editing has to be reachable from the record itself. Without this the
          only way to correct anything — or add a field — was to go back to the
          space and find the row again. */}
      {/* Only when this type says a client may hold one — inviting somebody
          into an app to see a machine no client is allowed to hold is an
          offer with nothing behind it. */}
      {kind && shape.holder.enabled && shape.holder.clients && (
        <AssetInviteClient assetId={id} assetName={asset.name} spaceId={kind.spaceId} />
      )}

      {kind && (
        <AssetRaiseJob
          assetId={id}
          assetName={asset.name}
          spaceId={kind.spaceId}
          onRaised={() => qc.invalidateQueries({ queryKey: keys.assets.tasks(id) })}
        />
      )}

      {kind && (
        <AssetRecordDialog
          spaceId={kind.spaceId ?? ""}
          kind={kind}
          existing={{
            id: asset.id,
            name: asset.name,
            locationAddress: asset.locationAddress,
            locationLat: asset.locationLat,
            locationLng: asset.locationLng,
            // The whole set, not the first of it. Passing one would let a
            // rename quietly drop every other resident on save.
            holders: holders.map((h) => ({ userId: h.userId, customerId: h.customerId })),
            details: asset.details,
            status: asset.status,
            serialNumber: asset.serialNumber,
            manufacturer: asset.manufacturer,
            model: asset.model,
            installDate: asset.installDate,
            warrantyExpiry: asset.warrantyExpiry,
            notes: asset.notes,
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: keys.assets.record(id) })
            qc.invalidateQueries({ queryKey: keys.assets.activities(id) })
          }}
          trigger={
            <Button variant="outline" size="pill" className="shrink-0">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}
            </Button>
          }
        />
      )}
    </div>
  )
}
