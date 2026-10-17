"use client"

import { useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { assetsApi, type AssetListRow } from "@/lib/api"
import { keyColumn, linkColumns, listByLabel, type KindList, type KindShape } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { keys } from "@/lib/query-keys"

/** AssetFaults's state and handlers — everything before its markup, moved here unchanged. */
export function useAssetFaults({
  assetId, assetName, spaceId, list, shape,
}: Pick<{
  assetId: string
  assetName: string
  /** The space this asset's type belongs to, so a raised job lands there. */
  spaceId?: string | null
  list: KindList
  /** The whole kind, so a link column can find the table it points at. */
  shape: KindShape
}, 'assetId' | 'assetName' | 'spaceId' | 'list' | 'shape'>) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  // null = closed, "new" = adding, otherwise the id of the row being edited.
  const [editing, setEditing] = useState<string | null>(null)

  const faultsQ = useQuery({
    queryKey: keys.assets.rows(assetId, list.label, debouncedSearch),
    queryFn: () => assetsApi.getRows(assetId, list.label, { search: debouncedSearch || undefined, limit: 100 }),
  })

  // The first link column, whatever the customer called it, and the table it
  // points at. Nothing here knows the words "part" or "fault".
  const linkColumn = linkColumns(list)[0] ?? null
  const target = linkColumn?.linkTo ? listByLabel(shape, linkColumn.linkTo) : null

  // The whole target table, once: a row names a key, and resolving each one
  // separately would be a request per row on screen.
  const partsQ = useQuery({
    queryKey: keys.assets.rows(assetId, target?.label),
    queryFn: () => assetsApi.getRows(assetId, target!.label, { limit: 200 }),
    enabled: !!target,
  })

  // A catalogue longer than the window we fetched would make perfectly good
  // links read as "not in the catalogue" — the one message a technician must be
  // able to trust. Say the truth instead: we did not look at all of it.
  const catalogueTruncated =
    !!partsQ.data?.meta && partsQ.data.meta.total > partsQ.data.rows.length

  const linkCol = linkColumn?.label ?? null
  const codeCol = target ? keyColumn(target)?.label ?? null : null
  const parts = target
  const partByCode = new Map<string, AssetListRow>()
  if (codeCol) {
    for (const row of partsQ.data?.rows ?? []) {
      const code = (row.values?.[codeCol] ?? "").trim().toLowerCase()
      if (code) partByCode.set(code, row)
    }
  }

  const col = (row: AssetListRow, name: string) => (row.values?.[name] ?? "").trim()
  const pick = (row: AssetListRow, names: string[]) => {
    for (const n of names) {
      const hit = list.columns.find((c) => c.label.toLowerCase() === n)
      if (hit) {
        const v = col(row, hit.label)
        if (v) return v
      }
    }
    return ""
  }

  const rows = faultsQ.data?.rows ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: keys.assets.rows(assetId, list.label) })

  const remove = useMutation({
    mutationFn: (rowId: string) => assetsApi.removeRow(assetId, rowId),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message),
  })

  // Every part code the catalogue knows, for the picker below.
  const partOptions = useMemo(() => {
    if (!codeCol || !target) return []
    return (partsQ.data?.rows ?? [])
      .map((r) => ({
        code: (r.values?.[codeCol] ?? "").trim(),
        label: target.columns
          .filter((c) => c.label !== codeCol)
          .map((c) => (r.values?.[c.label] ?? "").trim())
          .filter(Boolean)
          .join(" · "),
      }))
      .filter((o) => o.code)
  }, [partsQ.data, target, codeCol])

  return {
    t,
    search,
    setSearch,
    editing,
    setEditing,
    faultsQ,
    target,
    partsQ,
    catalogueTruncated,
    linkCol,
    codeCol,
    parts,
    partByCode,
    col,
    pick,
    rows,
    refresh,
    remove,
    partOptions,
  }
}
