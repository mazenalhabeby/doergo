"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { assetsApi, type AssetCategory } from "@/lib/api"
import { encodeHolderList, type HolderKey } from "./holder-picker"
import { fieldsDroppedByMove } from "@hbcfield/shared/client"
import {
  normalizeKindShape,
  detailRowsForKind,
  type DetailRow,
  assetDateProblems,
  type AssetStatusKey,
} from "@hbcfield/shared/client"
import { asStatus } from "./asset-status"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/** One record of a kind — an apartment, a van. */
export interface AssetRecord {
  id: string
  name: string
  serialNumber?: string | null
  locationAddress?: string | null
  locationLat?: number | null
  locationLng?: number | null
  holderUserId?: string | null
  customerId?: string | null
  /** Who holds it. One entry, or several when the type allows it. */
  holders?: Array<{ userId?: string | null; customerId?: string | null }>
  details?: unknown
  status?: string | null
  manufacturer?: string | null
  model?: string | null
  installDate?: string | null
  warrantyExpiry?: string | null
  notes?: string | null
  _count?: { tasks?: number }
}

/** A stored date -> what `<input type="date">` holds. */
const dayOf = (v?: string | null) => (v ? v.slice(0, 10) : "")

/** The plate as the form holds it: every fact a string, empty meaning unset. */
export const factsOf = (r?: AssetRecord) => ({
  serialNumber: r?.serialNumber ?? "",
  manufacturer: r?.manufacturer ?? "",
  model: r?.model ?? "",
  installDate: dayOf(r?.installDate),
  warrantyExpiry: dayOf(r?.warrantyExpiry),
  notes: r?.notes ?? "",
})

export type Facts = ReturnType<typeof factsOf>

export const hasFacts = (f: Facts) => Object.values(f).some((v) => v.trim() !== "")

/*
  A holder is one string: "u:<userId>" or "c:<customerId>".

  One encoding for both sides keeps selection a set-membership test instead of
  two parallel lists that can disagree about who is chosen — and makes the
  single case a list of length one rather than a separate code path.
*/
export const encodeHolders = (r?: AssetRecord): HolderKey[] => {
  if (r?.holders?.length) return encodeHolderList(r.holders)
  // A record saved before types could hold several still answers the old way.
  if (r?.holderUserId) return [`u:${r.holderUserId}`]
  if (r?.customerId) return [`c:${r.customerId}`]
  return []
}

/** useAssetRecordDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetRecordDialogData({
  spaceId,
  kind,
  existing,
  onSaved,
  trigger,
}: Pick<Pick<{
  spaceId: string
  kind: AssetCategory
  existing?: AssetRecord
  onSaved: () => void
  trigger: React.ReactNode
}, 'spaceId' | 'kind' | 'existing' | 'onSaved' | 'trigger'>, 'spaceId' | 'kind' | 'existing' | 'onSaved' | 'trigger'>) {
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

  const destKindsQ = useQuery({
    queryKey: keys.assets.categories(destSpace),
    queryFn: () => assetsApi.getCategories(destSpace),
    enabled: open && moving && !!destSpace,
  })
  const destKinds = ((destKindsQ.data ?? []) as AssetCategory[]).filter((k) => k.id !== kind.id)
  const chosenKind = destKinds.find((k) => k.id === destKind)

  /*
    What the move throws away, named before anybody agrees to it.

    The same function the server uses to decide what to keep, read the other way
    round — so the sentence on screen and the rows actually deleted cannot
    disagree.
  */
  const dropped = chosenKind ? fieldsDroppedByMove(existing?.details, chosenKind.config) : []

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
  const setFact = (key: keyof Facts, value: string) => setFacts((f) => ({ ...f, [key]: value }))
  // The same rule the server refuses on, asked while the dates are being typed.
  const dateProblems = assetDateProblems({ installDate: facts.installDate, warrantyExpiry: facts.warrantyExpiry })

  /*
    Picking somebody.

    On a "one at a time" type a click REPLACES, which is what a single choice
    means and saves a deselect-then-select every time somebody moves a van to a
    new driver. On a "several" type it toggles, and the cap is the same one the
    server enforces — reached here it just stops adding rather than letting
    somebody build a list that will be refused on save.
  */
  const [rows, setRows] = useState<DetailRow[]>(detailRowsForKind(shape, existing?.details))

  const setRow = (i: number, patch: Partial<DetailRow>) =>
    setRows((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((d) => [...d, { label: "", value: "" }])
  const removeRow = (i: number) => setRows((d) => d.filter((_, idx) => idx !== i))

  // Which labels this record's KIND asks for. Those rows keep their label — it
  // belongs to the kind, and editing it here would only rename it on this one
  // record while every other record kept the old name.
  const kindLabels = new Set(shape.fields.map((f) => f.label.toLowerCase()))
  const isFromKind = (label: string) => kindLabels.has(label.trim().toLowerCase())

  // A label typed twice would be silently deduped on save, and the second one's
  // value would vanish. Say so instead.
  const labelCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.label.trim().toLowerCase()
    if (k) acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const duplicated = (label: string) => (labelCounts[label.trim().toLowerCase()] ?? 0) > 1

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
  }
}
