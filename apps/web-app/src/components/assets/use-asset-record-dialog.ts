"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { assetsApi, type AssetCategory } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import {
  normalizeKindShape,
  detailRowsForKind,
  type DetailRow,
  assetDateProblems,
  type AssetStatusKey,
  kindHolderLabel,
} from "@hbcfield/shared/client"
import { decodeHolders } from "./holder-picker"
import { asStatus } from "./asset-status"
import { encodeHolders, type Facts, factsOf, hasFacts, factsPayload, type AssetRecord } from "./asset-record"

/** The record dialog's form: what it holds, the move it may carry, the save and the reset on opening. */
export function useAssetRecordDialog({
  spaceId,
  kind,
  existing,
  onSaved,
}: {
  spaceId: string
  kind: AssetCategory
  existing?: AssetRecord
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const shape = normalizeKindShape(kind.config)
  const [open, setOpen] = useState(false)

  /*
    Which workspace this record lives in.

    ⚠️ An asset has no workspace of its own — it inherits its KIND's
    (`AssetCategory.spaceId`), so the answer was only ever implied by which tab
    somebody happened to be on. Two workspaces can both have a kind called
    "Vehicles", and nothing in this dialog said which one was about to receive
    the record.

    Read from the list the nav and the space tabs already fetched, so saying so
    costs nothing.
  */
  const { data: spaces = [] } = useActiveSpaces({ enabled: open && !!spaceId })
  const spaceName = spaces.find((sp) => sp.id === spaceId)?.name

  /*
    Moving the record to another workspace.

    An asset has no workspace of its own — it inherits its KIND's — so a move is
    a change of kind, and the kind decides which of the record's fields survive
    it. That is why this is not a workspace dropdown: choosing "Warehouse" alone
    would not say what the record becomes when it gets there.
  */
  const [moving, setMoving] = useState(false)
  const [destSpace, setDestSpace] = useState("")
  const [destKind, setDestKind] = useState("")

  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.locationAddress ?? "")
  const [lat, setLat] = useState<number | null>(existing?.locationLat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.locationLng ?? null)
  const [holders, setHolders] = useState<string[]>(encodeHolders(existing))
  const [status, setStatus] = useState<AssetStatusKey>(asStatus(existing?.status))
  const [facts, setFacts] = useState<Facts>(factsOf(existing))
  /*
    "More about it" opens by itself when there is something in it. Closed on a
    record that has a serial number would hide the one fact somebody opened the
    form to correct.
  */
  const [moreOpen, setMoreOpen] = useState(hasFacts(factsOf(existing)))
  // The same rule the server refuses on, asked while the dates are being typed.
  const dateProblems = assetDateProblems({ installDate: facts.installDate, warrantyExpiry: facts.warrantyExpiry })

  const [rows, setRows] = useState<DetailRow[]>(detailRowsForKind(shape, existing?.details))

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: name.trim() || address.trim(),
        locationAddress: shape.hasAddress ? address : undefined,
        locationLat: shape.hasAddress ? (lat ?? undefined) : undefined,
        locationLng: shape.hasAddress ? (lng ?? undefined) : undefined,
        // Always sent, never omitted: an absent key means "leave them alone",
        // and an empty list means "nobody". Clearing the last resident has to
        // reach the server as a decision.
        holders: shape.holder.enabled ? decodeHolders(holders) : [],
        // Empty answers are kept, so a prompted field that nobody filled in
        // still shows as waiting rather than vanishing from the record.
        details: rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), value: r.value.trim() })),
        status,
        ...factsPayload(facts, !!existing),
      }
      return existing
        ? // A move is a change of kind; the server drops the fields the
          // destination does not ask for, which is what `dropped` warned about.
          assetsApi.updateAsset(existing.id, { ...base, ...(moving && destKind ? { categoryId: destKind } : {}) })
        : /*
          `spaceId` is sent for the MODULE GATE, not stored — an asset inherits
          its space from its kind, and at creation there is no asset yet for the
          guard to ask. Without it the gate falls back to the ORGANIZATION's
          modules and refuses "assets is not switched on" to an org that runs
          assets in one workspace, which is the normal way to run them.
        */
          assetsApi.createAsset({ ...base, categoryId: kind.id, spaceId })
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
  }
}
