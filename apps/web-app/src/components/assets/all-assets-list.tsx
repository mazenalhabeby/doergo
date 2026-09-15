"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Package, Search, User } from "lucide-react"

import { assetsApi } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetStatusChip } from "@/components/assets/asset-status"

const PAGE_SIZE = 50

/** The fields of a list row this finder reads — the list response carries more. */
interface FoundAsset {
  id: string
  name: string
  status?: string
  category?: { name?: string; spaceId?: string | null } | null
  holders?: Array<{ user?: { firstName?: string; lastName?: string } | null; customer?: { name?: string } | null }>
}

/**
 * Every asset the reader may see, across workspaces — to FIND one.
 *
 * Not a second register: kinds, adding and editing stay in a workspace, where a
 * kind belongs. This answers "where is GM-HBC-42?" without knowing which depot
 * it is in, which is the question somebody on the phone to a driver asks.
 *
 * The server narrows to the reader's own workspaces (the same rule as every
 * asset read), searches and pages — so a register of thousands costs one small
 * query per keystroke pause, never the whole list.
 */
export function AllAssetsList({ spaceNames }: { spaceNames: Record<string, string> }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState("")
  const [search, setSearch] = useState("")
  const [showRetired, setShowRetired] = useState(false)
  const [page, setPage] = useState(1)

  // Wait for a pause in typing: a query per keystroke is a query per letter.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(typed.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [typed])

  const { data, isLoading } = useQuery({
    queryKey: ["assets", "all", search, showRetired, page],
    queryFn: () =>
      assetsApi.getAssets({
        search: search || undefined,
        hideRetired: showRetired ? undefined : "true",
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  })

  const rows = useMemo(() => (data?.data ?? []) as unknown as FoundAsset[], [data])
  const totalPages = data?.meta?.totalPages ?? 1

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("assets.all.search", "Search by name, plate, serial, maker or model")}
            className="pl-9"
            aria-label={t("assets.all.search", "Search by name, plate, serial, maker or model")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showRetired} onCheckedChange={(v) => { setShowRetired(v === true); setPage(1) }} />
          {t("assets.all.showRetired", "Show retired")}
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t("assets.all.name", "Name")}</th>
              <th className="px-4 py-2 font-medium">{t("assets.all.kind", "Kind")}</th>
              <th className="px-4 py-2 font-medium">{t("assets.all.workspace", "Workspace")}</th>
              <th className="px-4 py-2 font-medium">{t("assets.all.heldBy", "Held by")}</th>
              <th className="px-4 py-2 font-medium">{t("assets.all.status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={5} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {search
                    ? t("assets.all.noMatch", "Nothing matches that")
                    : t("assets.all.empty", "No assets yet")}
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const holders = a.holders ?? []
              const first = holders[0]
              const firstName = first?.user
                ? `${first.user.firstName ?? ""} ${first.user.lastName ?? ""}`.trim()
                : first?.customer?.name ?? ""
              return (
                <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <Link href={`/assets/${a.id}`} className="hover:underline">{a.name}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.category?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {(a.category?.spaceId && spaceNames[a.category.spaceId]) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {holders.length === 0 ? (
                      t("assetRecords.free", "Nobody")
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {firstName || t("assets.all.someone", "Someone")}
                        {holders.length > 1 && <span className="tabular-nums opacity-70">+{holders.length - 1}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><AssetStatusChip status={a.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t("common.previous", "Previous")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t("common.next", "Next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
