"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { Building2 } from "lucide-react"

import { type AssetCategory } from "@/lib/api"
import { HolderPicker } from "./holder-picker"
import { kindNameLabel } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AssetStatusPicker } from "./asset-status"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { useAssetRecordDialog } from "./use-asset-record-dialog"
import { type AssetRecord } from "./asset-record"
import { AssetDetailFields } from "./asset-detail-fields"
import { AssetFactsFold } from "./asset-facts-fold"
import { AssetMoveSection } from "./asset-move-section"
export { type AssetRecord, factsPayload } from "./asset-record"

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />,
})

/**
 * Add or edit one record, built from what its KIND says.
 *
 * Every part is here because the kind asked for it: the name carries the label
 * that kind chose, the map appears only if it has an address, the holder picker
 * is called whatever that kind calls it and offers only the sides it allows, and
 * the fields are the ones that kind prompts for. Nothing here knows what an
 * apartment is.
 */
export function AssetRecordDialog({
  spaceId,
  kind,
  existing,
  onSaved,
  trigger,
}: {
  spaceId: string
  kind: AssetCategory
  existing?: AssetRecord
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const {
    shape,
    open,
    setOpen,
    spaces,
    spaceName,
    moving,
    setMoving,
    destSpace,
    setDestSpace,
    destKind,
    setDestKind,
    name,
    setName,
    address,
    setAddress,
    lat,
    setLat,
    lng,
    setLng,
    holders,
    setHolders,
    status,
    setStatus,
    facts,
    setFacts,
    moreOpen,
    setMoreOpen,
    dateProblems,
    rows,
    setRows,
    save,
    reset,
    holderLabel,
  } = useAssetRecordDialog({ spaceId, kind, existing, onSaved })
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? t("assetRecords.editTitle", "Edit {{kind}}", { kind: kind.name })
              : t("assetRecords.newTitle", "Add to {{kind}}", { kind: kind.name })}
          </DialogTitle>
          {/*
            Said, not asked. The workspace is decided by the kind and cannot be
            chosen here — an asset moves between workspaces only by moving to a
            kind in another one, which changes its type and the fields that come
            with it. What this fixes is that it was not stated at all.
          */}
          {spaceName && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {existing
                ? t("assetRecords.inWorkspace", "In {{name}}", { name: spaceName })
                : t("assetRecords.toWorkspace", "Added to {{name}}", { name: spaceName })}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{kindNameLabel(shape, t("assetRecords.name", "Name"))}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("assetRecords.namePh", "e.g. Apartment 4B")}
              autoFocus
            />
          </div>

          {shape.hasAddress && (
            <div className="space-y-1">
              <Label>{t("assetRecords.address", "Address")}</Label>
              <LocationPicker
                lat={lat}
                lng={lng}
                address={address}
                onLocationChange={(la, ln) => {
                  setLat(la)
                  setLng(ln)
                }}
                onAddressChange={setAddress}
              />
            </div>
          )}

          {shape.holder.enabled && (
            <div className="space-y-1.5">
              <Label>{holderLabel}</Label>
              {/* The same picker the handover dialog uses. Two copies of a
                  control that enforces a kind's rules is how a single-holder van
                  ends up with two drivers on one screen and one on the other. */}
              <HolderPicker
                shape={shape}
                spaceId={spaceId}
                value={holders}
                onChange={setHolders}
                enabled={open}
                showChips={shape.holder.multiple}
              />
            </div>
          )}

          <AssetDetailFields shape={shape} rows={rows} setRows={setRows} />
        </div>

        {/*
          The record's state. After the fields somebody came to fill in, and
          before the rarely-touched facts: changing it is common enough to be in
          view, and consequential enough not to be the first control.
        */}
        <div className="mt-3 space-y-1.5">
          <Label>{t("assetFacts.status.label", "Status")}</Label>
          <AssetStatusPicker value={status} onChange={setStatus} />
        </div>

        {/*
          More about it: the plate.

          Serial, maker, model, the two dates and notes existed on every record
          with nothing to write them. Behind a fold because most kinds never
          need them, and a van's form should not open on a warranty date.
        */}
        <AssetFactsFold
          moreOpen={moreOpen}
          setMoreOpen={setMoreOpen}
          facts={facts}
          setFacts={setFacts}
          dateProblems={dateProblems}
        />

        {/*
          Moving it somewhere else.

          At the bottom, behind a link, and never open by default: it is the one
          control here that changes what the record IS, and it has no business
          sitting among the fields somebody came to correct a serial number in.
        */}
        {existing && (
          <AssetMoveSection
            open={open}
            spaceId={spaceId}
            kind={kind}
            details={existing.details}
            spaces={spaces}
            moving={moving}
            setMoving={setMoving}
            destSpace={destSpace}
            setDestSpace={setDestSpace}
            destKind={destKind}
            setDestKind={setDestKind}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={(!name.trim() && !address.trim()) || dateProblems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
