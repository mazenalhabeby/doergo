"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Building2, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { HolderPicker, decodeHolders, encodeHolderList, type HolderKey } from "./holder-picker"
import { fieldsDroppedByMove } from "@hbcfield/shared/client"
import {
  normalizeKindShape, detailRowsForKind, kindHolderLabel, kindNameLabel, type DetailRow,
  ASSET_RECORD_LIMITS, assetDateProblems, type AssetStatusKey,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AssetStatusPicker, asStatus } from "./asset-status"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { useAssetRecordDialog, type AssetRecord } from "./use-asset-record-dialog"
import { LocationPicker } from "./asset-record-dialog-helpers"
import { AssetRecordDialogFields } from "./asset-record-dialog-fields"
import { AssetRecordDialogMore } from "./asset-record-dialog-more"
export { type AssetRecord, factsPayload } from "./use-asset-record-dialog"

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
  const vm = useAssetRecordDialog({ spaceId, kind, existing, onSaved, trigger })
  const {
    t,
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
    destKindsQ,
    destKinds,
    chosenKind,
    dropped,
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
    moreOpen,
    setMoreOpen,
    setFact,
    dateProblems,
    rows,
    setRow,
    addRow,
    removeRow,
    isFromKind,
    duplicated,
    save,
    reset,
    holderLabel,
  } = vm

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
                lat={lat} lng={lng} address={address}
                onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
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

          <AssetRecordDialogFields vm={vm} />
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
        <AssetRecordDialogMore vm={vm} />

        {/*
          Moving it somewhere else.

          At the bottom, behind a link, and never open by default: it is the one
          control here that changes what the record IS, and it has no business
          sitting among the fields somebody came to correct a serial number in.
        */}
        {existing && (
          <div className="mt-3 border-t border-border pt-3">
            {!moving ? (
              <button
                type="button"
                onClick={() => setMoving(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Building2 className="h-3.5 w-3.5" />
                {t("assetRecords.move", "Move to another workspace")}
              </button>
            ) : (
              <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold">{t("assetRecords.moveTitle", "Move to another workspace")}</p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    value={destSpace}
                    onChange={(e) => { setDestSpace(e.target.value); setDestKind("") }}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                  >
                    <option value="">{t("assetRecords.moveSpace", "Workspace…")}</option>
                    {spaces.filter((sp) => sp.id !== spaceId).map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                  {/*
                    The kind, not just the workspace: the record has to become
                    something when it arrives, and the kind is what it becomes.
                  */}
                  <select
                    value={destKind}
                    onChange={(e) => setDestKind(e.target.value)}
                    disabled={!destSpace || destKindsQ.isLoading}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50"
                  >
                    <option value="">{t("assetRecords.moveKind", "Kind…")}</option>
                    {destKinds.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>

                {destSpace && !destKindsQ.isLoading && destKinds.length === 0 && (
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("assetRecords.moveNoKinds", "That workspace has no asset kinds yet.")}
                  </p>
                )}

                {/* Named, one by one. A count would not tell anybody whether the
                    thing they care about is in it. */}
                {dropped.length > 0 && (
                  <p className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                    {t(
                      "assetRecords.moveDrops",
                      "{{kind}} does not have these fields, and they will be deleted:",
                      { kind: chosenKind?.name ?? "" })}{" "}
                    <b>{dropped.join(", ")}</b>
                  </p>
                )}
                {chosenKind && dropped.length === 0 && (
                  <p className="text-[11.5px] text-muted-foreground">
                    {t(
                      "assetRecords.moveKeeps",
                      "Every field on this record exists in {{kind}} — nothing is lost.",
                      { kind: chosenKind.name })}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => { setMoving(false); setDestSpace(""); setDestKind("") }}
                  className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
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

