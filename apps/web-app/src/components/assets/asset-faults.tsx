"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Package, Search, ShieldAlert, Wrench } from "lucide-react"

import { assetsApi, type AssetListRow } from "@/lib/api"
import { partLinkColumn, partCodeColumn, type KindList } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
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
  assetId, list, parts,
}: {
  assetId: string
  list: KindList
  /** The kind's parts catalogue, when it declares one. */
  parts: KindList | null
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")

  const faultsQ = useQuery({
    queryKey: ["asset-rows", assetId, list.label, search],
    queryFn: () => assetsApi.getRows(assetId, list.label, { search: search || undefined, limit: 100 }),
  })

  // The whole catalogue, once: a fault names a part code, and looking each one
  // up separately would be a request per row on screen.
  const partsQ = useQuery({
    queryKey: ["asset-rows", assetId, parts?.label],
    queryFn: () => assetsApi.getRows(assetId, parts!.label, { limit: 200 }),
    enabled: !!parts,
  })

  const linkCol = partLinkColumn(list)
  const codeCol = parts ? partCodeColumn(parts) : null
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

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("assetFaults.search", "Search a code or a symptom…")}
          className="h-9 pl-8"
        />
      </div>

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

            return (
              <div key={row.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {code || "—"}
                  </span>
                  <span className="text-sm font-medium text-foreground">{meaning}</span>
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
