"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Package, Pencil, Plus, Search, ShieldAlert, Trash2, Wrench, X } from "lucide-react"

import { assetsApi, type AssetListRow } from "@/lib/api"
import {
  keyColumn, linkColumns, listByLabel,
  type KindList, type KindShape,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * The fault-code lookup a technician standing at the machine actually uses.
 *
 * A raw table of codes is a list of numbers. What answers the question is:
 * the code, what it means, why it happens, what to do about it — and which part
 * that needs, resolved out of the same kind's catalogue so the technician does
 * not have to go and find it.
 *
 * Modelled on how maintenance systems structure this (code / meaning / cause /
 * remedy, with a safety note), and kept on the KIND because the library belongs
 * to the equipment class, not to one machine.
 */
export function AssetFaults({
  assetId, list, shape,
}: {
  assetId: string
  list: KindList
  /** The whole kind, so a link column can find the table it points at. */
  shape: KindShape
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  // null = closed, "new" = adding, otherwise the id of the row being edited.
  const [editing, setEditing] = useState<string | null>(null)

  const faultsQ = useQuery({
    queryKey: ["asset-rows", assetId, list.label, search],
    queryFn: () => assetsApi.getRows(assetId, list.label, { search: search || undefined, limit: 100 }),
  })

  // The first link column, whatever the customer called it, and the table it
  // points at. Nothing here knows the words "part" or "fault".
  const linkColumn = linkColumns(list)[0] ?? null
  const target = linkColumn?.linkTo ? listByLabel(shape, linkColumn.linkTo) : null

  // The whole target table, once: a row names a key, and resolving each one
  // separately would be a request per row on screen.
  const partsQ = useQuery({
    queryKey: ["asset-rows", assetId, target?.label],
    queryFn: () => assetsApi.getRows(assetId, target!.label, { limit: 200 }),
    enabled: !!target,
  })

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
  const refresh = () => qc.invalidateQueries({ queryKey: ["asset-rows", assetId, list.label] })

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("assetFaults.search", "Search a code or a symptom…")}
            className="h-9 pl-8"
          />
        </div>
        <Button size="sm" onClick={() => setEditing(editing === "new" ? null : "new")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("assetFaults.add", "Add a code")}
        </Button>
      </div>

      {list.shared && (
        <p className="text-[11px] text-muted-foreground">
          {t("assetFaults.sharedNote", "This library belongs to the kind — every one of them reads it, and a change here changes it for all.")}
        </p>
      )}

      {editing === "new" && (
        <FaultForm
          assetId={assetId}
          list={list}
          partOptions={partOptions}
          linkCol={linkCol}
          onDone={() => { setEditing(null); refresh() }}
          onCancel={() => setEditing(null)}
        />
      )}

      {faultsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? t("assetLists.noMatch", "Nothing matches that") : t("assetFaults.empty", "No fault codes yet")}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const code = pick(row, ["code"])
            const meaning = pick(row, ["meaning", "title"])
            const cause = pick(row, ["cause"])
            const fix = pick(row, ["fix", "remedy", "solution"])
            const safety = pick(row, ["safety"])
            const partCode = linkCol ? col(row, linkCol) : ""
            const part = partCode ? partByCode.get(partCode.toLowerCase()) : undefined

            if (editing === row.id) {
              return (
                <FaultForm
                  key={row.id}
                  assetId={assetId}
                  list={list}
                  existing={row}
                  partOptions={partOptions}
                  linkCol={linkCol}
                  onDone={() => { setEditing(null); refresh() }}
                  onCancel={() => setEditing(null)}
                />
              )
            }

            return (
              <div key={row.id} className="group rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {code || "—"}
                  </span>
                  <span className="text-sm font-medium text-foreground">{meaning}</span>
                  <span className="ml-auto flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setEditing(row.id)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={t("common.edit", "Edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(row.id)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("common.remove", "Remove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>

                <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                  {cause && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span><span className="text-foreground">{t("assetFaults.cause", "Cause")}:</span> {cause}</span>
                    </p>
                  )}
                  {fix && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span><span className="text-foreground">{t("assetFaults.fix", "Fix")}:</span> {fix}</span>
                    </p>
                  )}
                </div>

                {partCode && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm">
                    <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-xs text-foreground">{partCode}</span>
                    {part ? (
                      // Resolved out of the kind's own catalogue, so the
                      // technician sees what the code means without leaving.
                      <span className="text-muted-foreground">
                        {/* In the catalogue's own column order. Object.entries
                            follows insertion order, which put Qty before Name
                            and read as nonsense. */}
                        {parts!.columns
                          .filter((c) => c.label !== codeCol)
                          .map((c) => (part.values?.[c.label] ?? "").trim())
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        {t("assetFaults.partMissing", "not in the parts catalogue")}
                      </span>
                    )}
                  </p>
                )}

                {safety && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {safety}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Add or change one fault code.
 *
 * The Part field is a PICKER over the kind's catalogue, not a box to type a
 * code into. Typed by hand it drifts — a transposed digit, a renamed part — and
 * the technician standing at the machine gets "not in the parts catalogue" at
 * the moment they least need it.
 */
function FaultForm({
  assetId, list, existing, partOptions, linkCol, onDone, onCancel,
}: {
  assetId: string
  list: KindList
  existing?: AssetListRow
  partOptions: { code: string; label: string }[]
  /** The column that points at another table, if this one has any. */
  linkCol: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {}
    for (const c of list.columns) start[c.label] = existing?.values?.[c.label] ?? ""
    return start
  })

  const set = (col: string, v: string) => setValues((s) => ({ ...s, [col]: v }))

  const save = useMutation({
    mutationFn: () =>
      existing
        ? assetsApi.updateRow(assetId, existing.id, values)
        : assetsApi.addRow(assetId, list.label, values),
    onSuccess: onDone,
    onError: (e: Error) => notify.error(e.message),
  })

  const filled = Object.values(values).some((v) => v.trim())

  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {list.columns.map((c) => {
          const isPart = linkCol && c.label === linkCol
          return (
            <div key={c.label} className={cn(c.label.toLowerCase() === "safety" && "sm:col-span-2")}>
              <label className="text-[11px] text-muted-foreground">{c.label}</label>
              {isPart && partOptions.length > 0 ? (
                // Chosen from the catalogue, so the link always resolves.
                <select
                  value={values[c.label] ?? ""}
                  onChange={(e) => set(c.label, e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">{t("assetFaults.noPart", "— no part —")}</option>
                  {partOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}{o.label ? ` · ${o.label}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className="mt-1 h-9"
                  value={values[c.label] ?? ""}
                  onChange={(e) => set(c.label, e.target.value)}
                  placeholder={c.label}
                />
              )}
            </div>
          )
        })}
      </div>

      {linkCol && partOptions.length === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {t("assetFaults.noCatalogue", "No parts catalogue on this kind yet — add one and its codes can be picked here.")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" /> {t("common.cancel", "Cancel")}
        </Button>
        <Button size="sm" disabled={!filled || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {t("common.save", "Save")}
        </Button>
      </div>
    </div>
  )
}
