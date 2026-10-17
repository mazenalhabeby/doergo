"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { assetsApi, type AssetCategory } from "@/lib/api"
import { decodeHolders, encodeHolderList, type HolderKey } from "./holder-picker"
import { fieldsDroppedByMove } from "@hbcfield/shared/client"
import {
  normalizeKindShape,
  detailRowsForKind,
  kindHolderLabel,
  type DetailRow,
  assetDateProblems,
  type AssetStatusKey,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { asStatus } from "./asset-status"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { useAssetRecordDialogData, encodeHolders, type Facts, factsOf, hasFacts, type AssetRecord } from "./use-asset-record-dialog-data"
export { encodeHolders, type Facts, factsOf, hasFacts, type AssetRecord, dayOf } from "./use-asset-record-dialog-data"

/**
 * What a save sends for the plate.
 *
 * An emptied box is sent as null, not "": null clears the fact, while an empty
 * string stored in its place reads as "has a serial number, and it is blank".
 * On a new record an empty box is simply not sent.
 */
export function factsPayload(facts: Facts, editing: boolean): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of Object.keys(facts) as Array<keyof Facts>) {
    const value = facts[key].trim()
    if (value) out[key] = value
    else if (editing) out[key] = null
  }
  return out
}

/** AssetRecordDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetRecordDialog({
  spaceId,
  kind,
  existing,
  onSaved,
  trigger,
}: Pick<{
  spaceId: string
  kind: AssetCategory
  existing?: AssetRecord
  onSaved: () => void
  trigger: React.ReactNode
}, 'spaceId' | 'kind' | 'existing' | 'onSaved' | 'trigger'>) {
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
    setFacts,
    moreOpen,
    setMoreOpen,
    setFact,
    dateProblems,
    rows,
    setRows,
    setRow,
    addRow,
    removeRow,
    isFromKind,
    duplicated,
  } = useAssetRecordDialogData({ spaceId, kind, existing, onSaved, trigger })

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: name.trim() || address.trim(),
        locationAddress: shape.hasAddress ? address : undefined,
        locationLat: shape.hasAddress ? lat ?? undefined : undefined,
        locationLng: shape.hasAddress ? lng ?? undefined : undefined,
        // Always sent, never omitted: an absent key means "leave them alone",
        // and an empty list means "nobody". Clearing the last resident has to
        // reach the server as a decision.
        holders: shape.holder.enabled ? decodeHolders(holders) : [],
        // Empty answers are kept, so a prompted field that nobody filled in
        // still shows as waiting rather than vanishing from the record.
        details: rows
          .filter((r) => r.label.trim())
          .map((r) => ({ label: r.label.trim(), value: r.value.trim() })),
        status,
        ...factsPayload(facts, !!existing),
      }
      return existing
        // A move is a change of kind; the server drops the fields the
        // destination does not ask for, which is what `dropped` warned about.
        ? assetsApi.updateAsset(existing.id, { ...base, ...(moving && destKind ? { categoryId: destKind } : {}) })
        /*
          `spaceId` is sent for the MODULE GATE, not stored — an asset inherits
          its space from its kind, and at creation there is no asset yet for the
          guard to ask. Without it the gate falls back to the ORGANIZATION's
          modules and refuses "assets is not switched on" to an org that runs
          assets in one workspace, which is the normal way to run them.
        */
        : assetsApi.createAsset({ ...base, categoryId: kind.id, spaceId })
    },
    onSuccess: () => {
      notify.success(existing ? t("common.saved", "Saved") : t("assetRecords.added", "Added"))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || t("common.saveFailed", "Could not save")),
  })

  const reset = (next: boolean) => {
    if (next) {
      setName(existing?.name ?? "")
      setAddress(existing?.locationAddress ?? "")
      setLat(existing?.locationLat ?? null)
      setLng(existing?.locationLng ?? null)
      setHolders(encodeHolders(existing))
      setRows(detailRowsForKind(shape, existing?.details))
      setStatus(asStatus(existing?.status))
      setFacts(factsOf(existing))
      setMoreOpen(hasFacts(factsOf(existing)))
    }
    setOpen(next)
  }

  const holderLabel = kindHolderLabel(shape, t("assetRecords.holder", "Held by"))

  return {
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
  }
}

/** What AssetRecordDialog and its sections read. */
export type AssetRecordDialogState = ReturnType<typeof useAssetRecordDialog>
