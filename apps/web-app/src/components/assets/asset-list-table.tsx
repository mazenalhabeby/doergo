"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Search, Trash2 } from "lucide-react"

import { assetsApi, type AssetListRow } from "@/lib/api"
import { type KindList } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * One table on a record — a machine's parts, an apartment's keys.
 *
 * Paged and searched on the SERVER. A parts catalogue can run to hundreds of
 * rows, and filtering a fetched page in the browser would quietly only search
 * what had already been loaded.
 */
export function AssetListTable({ assetId, list }: { assetId: string; list: KindList }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const rowsQ = useQuery({
    queryKey: ["asset-rows", assetId, list.label, search, page],
    queryFn: () => assetsApi.getRows(assetId, list.label, { search: search || undefined, page, limit: 50 }),
  })
  const rows = rowsQ.data?.rows ?? []
  const meta = rowsQ.data?.meta

  const refresh = () => qc.invalidateQueries({ queryKey: ["asset-rows", assetId, list.label] })

  const add = useMutation({
    mutationFn: () => assetsApi.addRow(assetId, list.label, draft),
    onSuccess: () => { setDraft({}); refresh() },
    onError: (e: Error) => notify.error(e.message),
  })

  const save = useMutation({
    mutationFn: ({ rowId, values }: { rowId: string; values: Record<string, string> }) =>
      assetsApi.updateRow(assetId, rowId, values),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (rowId: string) => assetsApi.removeRow(assetId, rowId),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message),
  })

  const canAdd = list.columns.some((c) => (draft[c.label] ?? "").trim()) && !add.isPending

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t("assetLists.search", "Search…")}
            className="h-8 pl-8 text-sm"
          />
        </div>
        {meta && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {t("assetLists.count", "{{count}} rows", { count: meta.total })}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              {list.columns.map((c) => (
                <th key={c.label} className="px-3 py-2 text-left font-medium">{c.label}</th>
              ))}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rowsQ.isLoading ? (
              <tr>
                <td colSpan={list.columns.length + 1} className="p-3">
                  <Skeleton className="h-8 w-full rounded" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={list.columns.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {search
                    ? t("assetLists.noMatch", "Nothing matches that")
                    : t("assetLists.empty", "Nothing in here yet")}
                </td>
              </tr>
            ) : (
              rows.map((row: AssetListRow) => (
                <Row
                  key={row.id}
                  row={row}
                  list={list}
                  onSave={(values) => save.mutate({ rowId: row.id, values })}
                  onRemove={() => remove.mutate(row.id)}
                />
              ))
            )}

            {/* The add row sits in the table, so a new part is typed where the
                others are read rather than in a dialog on top of them. */}
            <tr className="border-t border-border bg-muted/20">
              {list.columns.map((c) => (
                <td key={c.label} className="px-2 py-1.5">
                  <Input
                    value={draft[c.label] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.label]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && canAdd) add.mutate() }}
                    placeholder={c.label}
                    className="h-8 text-sm"
                  />
                </td>
              ))}
              <td className="px-2 py-1.5">
                <Button size="sm" disabled={!canAdd} onClick={() => add.mutate()} className="h-8 w-8 p-0">
                  {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.previous", "Previous")}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{page} / {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("common.next", "Next")}
          </Button>
        </div>
      )}
    </div>
  )
}

/** One row, edited in place and saved when the cell loses focus. */
function Row({
  row, list, onSave, onRemove,
}: {
  row: AssetListRow
  list: KindList
  onSave: (values: Record<string, string>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(row.values ?? {})

  return (
    <tr className="border-b border-border/40 last:border-0">
      {list.columns.map((c) => (
        <td key={c.label} className="px-2 py-1.5">
          <Input
            value={values[c.label] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [c.label]: e.target.value }))}
            // Saved on blur rather than per keystroke: a parts table is a lot of
            // typing, and a request per character would be a request per character.
            onBlur={() => {
              if (JSON.stringify(values) !== JSON.stringify(row.values ?? {})) onSave(values)
            }}
            className="h-8 border-transparent bg-transparent text-sm hover:border-border focus:border-border"
          />
        </td>
      ))}
      <td className="px-2 py-1.5">
        <button
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
          aria-label={t("common.remove", "Remove")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}
