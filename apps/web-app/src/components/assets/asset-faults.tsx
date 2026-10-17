"use client"

import { useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Package, Pencil, Plus, Search, ShieldAlert, Trash2, Wrench, X } from "lucide-react"

import { assetsApi, type AssetListRow } from "@/lib/api"
import { keyColumn, linkColumns, listByLabel, type KindList, type KindShape } from "@hbcfield/shared/client"
import { AssetRaiseJob } from "@/components/assets/asset-raise-job"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { keys } from "@/lib/query-keys"
import { useAssetFaults } from "./use-asset-faults"
import { FaultForm } from "./asset-faults-helpers"
import { EmptyNote } from "@/components/ui/empty-note"

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
  assetId,
  assetName,
  spaceId,
  list,
  shape,
}: {
  assetId: string
  assetName: string
  /** The space this asset's type belongs to, so a raised job lands there. */
  spaceId?: string | null
  list: KindList
  /** The whole kind, so a link column can find the table it points at. */
  shape: KindShape
}) {
  const {
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
  } = useAssetFaults({ assetId, assetName, spaceId, list, shape })

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
          {t(
            "assetFaults.sharedNote",
            "This library belongs to the kind — every one of them reads it, and a " + "change here changes it for all.",
          )}
        </p>
      )}

      {editing === "new" && (
        <FaultForm
          assetId={assetId}
          list={list}
          partOptions={partOptions}
          linkCol={linkCol}
          onDone={() => {
            setEditing(null)
            refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {faultsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyNote>
          {search ? t("assetLists.noMatch", "Nothing matches that") : t("assetFaults.empty", "No fault codes yet")}
        </EmptyNote>
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
                  onDone={() => {
                    setEditing(null)
                    refresh()
                  }}
                  onCancel={() => setEditing(null)}
                />
              )
            }

            return (
              <div key={row.id} className="group rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={
                      "rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-sm font-semibold " +
                      "text-amber-600 dark:text-amber-400"
                    }
                  >
                    {code || "—"}
                  </span>
                  <span className="text-sm font-medium text-foreground">{meaning}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {/* The whole point of standing here with a code: turn it
                        into the job, with what it means and what to do already
                        written down. */}
                    <AssetRaiseJob
                      assetId={assetId}
                      assetName={assetName}
                      spaceId={spaceId}
                      faultCode={{ code, meaning, fix }}
                    />
                    <button
                      onClick={() => setEditing(row.id)}
                      className={
                        "rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
                        "hover:text-foreground group-hover:opacity-100"
                      }
                      aria-label={t("common.edit", "Edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(row.id)}
                      className={
                        "rounded p-1 text-muted-foreground opacity-0 transition-opacity " +
                        "hover:text-destructive group-hover:opacity-100"
                      }
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
                      <span>
                        <span className="text-foreground">{t("assetFaults.cause", "Cause")}:</span> {cause}
                      </span>
                    </p>
                  )}
                  {fix && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <span className="text-foreground">{t("assetFaults.fix", "Fix")}:</span> {fix}
                      </span>
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
                        {catalogueTruncated
                          ? t("assetFaults.partUnchecked", "not among the first {{count}} — search the catalogue", {
                              count: partsQ.data?.rows.length ?? 0,
                            })
                          : t("assetFaults.partMissing", "not in the catalogue")}
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
