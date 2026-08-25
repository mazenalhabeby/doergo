"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Package, Plus, Pencil, Search, Trash2, User } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import {
  normalizeKindShape, kindHolderLabel, detailRowsForKind, type KindShape,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "./section-header"
import { AssetKindDialog } from "./asset-kind-dialog"
import { AssetRecordDialog, type AssetRecord } from "@/components/assets/asset-record-dialog"
import { OrphanAssetsCard } from "./orphan-assets-card"

/**
 * What this space owns.
 *
 * The kinds belong to the SPACE: this office's "Apartments" and the depot's
 * "Vehicles" are separate lists. Adding the individual ones inside a kind is
 * the next step; this screen is where the kinds are set up.
 */
export function AssetsTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const router = useRouter()
  /*
    Which type is open lives in the URL.

    It used to be component state, on the reasoning that a settings pane owns
    its own view. That held right up until a record opened its own page: coming
    back, there was nothing anywhere saying which type had been open, so the
    back button landed on the space's first tab instead of the list the record
    came from. A sub-view somebody can navigate away from and return to is a
    place, and a place needs an address.
  */
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const openKindId = searchParams.get("type")

  const showKind = (id: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "assets")
    if (id) next.set("type", id)
    else next.delete("type")
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const kindsQ = useQuery({
    queryKey: ["space-asset-kinds", spaceId],
    queryFn: () => assetsApi.getCategories(spaceId),
  })
  const kinds = kindsQ.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-asset-kinds", spaceId] })

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteCategory(id),
    onSuccess: () => { notify.success(t("assetKinds.removed", "Removed")); invalidate() },
    onError: (err: Error) => notify.error(err?.message || t("assetKinds.removeFailed", "Could not remove this type")),
  })

  const openKind = kinds.find((k: AssetCategory) => k.id === openKindId)
  if (openKind) {
    return <KindContents spaceId={spaceId} kind={openKind} onBack={() => showKind(null)} onChanged={invalidate} />
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Package}
        accent="sky"
        title={t("assetKinds.title", "Assets")}
        description={t(
          "assetKinds.intro",
          "What this workspace owns — apartments, vehicles, machines. Set up a kind here, then add the ones you have inside it.",
        )}
        action={
          <AssetKindDialog
            spaceId={spaceId}
            onSaved={invalidate}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> {t("assetKinds.add", "New type")}
              </Button>
            }
          />
        }
      />

      {/* Assets that belong to no space, and so show on no other screen. Above
          the types rather than below them: it is a problem to clear, not a
          section to browse, and nothing under a list of cards gets read. */}
      <OrphanAssetsCard spaceId={spaceId} types={kinds} />

      {kindsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : kinds.length === 0 ? (
        <EmptyState icon={Package} title={t("assetKinds.empty", "No types yet")} />
      ) : (
        // Cards, not rows. A type is something you set up and come back to, and
        // a card has room to say what it holds — which is the question you
        // actually have when looking at this screen.
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kinds.map((kind: AssetCategory) => {
            const shape = normalizeKindShape(kind.config)
            const bits: string[] = []
            if (shape.holder.enabled) {
              bits.push(kindHolderLabel(shape, t("assetRecords.holder", "Held by")))
            }
            if (shape.hasAddress) bits.push(t("assetKinds.summaryAddress", "address"))
            if (shape.fields.length) {
              bits.push(t("assetKinds.summaryFields", "{{count}} details", { count: shape.fields.length }))
            }
            if (shape.lists.length) {
              bits.push(t("assetKinds.summaryTables", "{{count}} tables", { count: shape.lists.length }))
            }
            if (shape.money.enabled) bits.push(t("assetKinds.summaryMoney", "money"))

            return (
              <div key={kind.id} className="group relative rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                <button onClick={() => showKind(kind.id)} className="block w-full text-left">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                      <Package className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">{kind.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("assetKinds.count", "{{count}} inside", { count: kind._count?.assets ?? 0 })}
                      </p>
                    </div>
                  </div>

                  {kind.description && (
                    <p className="mt-2.5 line-clamp-2 text-xs text-muted-foreground">{kind.description}</p>
                  )}

                  {/* What one of them holds — the reason to open this card. */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {bits.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground/60">
                        {t("assetKinds.summaryNothing", "nothing set up yet")}
                      </span>
                    ) : bits.map((b) => (
                      <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {b}
                      </span>
                    ))}
                  </div>
                </button>

                {/* Kept out of the button: a link wrapping a button is invalid,
                    and nesting them makes the hit areas fight. */}
                <div className="absolute right-3 top-3 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <AssetKindDialog
                    spaceId={spaceId}
                    existing={kind}
                    onSaved={invalidate}
                    trigger={
                      <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  <button
                    onClick={() => del.mutate(kind.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={t("common.remove", "Remove")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Everything inside one kind — all the apartments, all the vans.
 *
 * The list stays plain on purpose: a name, who has it, where it is. What each
 * one did belongs on its own record.
 */
function KindContents({
  spaceId, kind, onBack, onChanged,
}: {
  spaceId: string
  kind: AssetCategory
  onBack: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const shape = normalizeKindShape(kind.config)
  const [search, setSearch] = useState("")

  const recordsQ = useQuery({
    queryKey: ["asset-records", kind.id],
    // Whole machines only — a gearbox is reached through its press.
    queryFn: () => assetsApi.getAssets({ categoryId: kind.id }),
  })

  // The list endpoint has returned both a bare array and a wrapped page, so
  // normalise once rather than guessing at each use.
  const raw = (recordsQ.data as unknown as { data?: unknown })?.data ?? recordsQ.data
  const records: AssetRecord[] = Array.isArray(raw) ? (raw as AssetRecord[]) : []

  // Filtered here rather than on the server: this list is one space's records of
  // one type, already bounded by the page above it.
  const q = search.trim().toLowerCase()
  const shown = q
    ? records.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.locationAddress?.toLowerCase().includes(q) ||
        r.serialNumber?.toLowerCase().includes(q),
      )
    : records

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["asset-records", kind.id] })
    onChanged()
  }

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => { notify.success(t("assetRecords.removed", "Removed")); refresh() },
    onError: (e: Error) => notify.error(e?.message || t("assetRecords.removeFailed", "Could not remove this")),
  })

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("assetKinds.title", "Assets")}
      </button>

      <SectionHeader
        icon={Package}
        accent="sky"
        title={kind.name}
        description={kind.description || t("assetRecords.intro", "Everything of this kind in this workspace.")}
        action={
          <AssetRecordDialog
            spaceId={spaceId}
            kind={kind}
            onSaved={refresh}
            trigger={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("common.add", "Add")}</Button>}
          />
        }
      />

      {records.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("assetRecords.search", "Search…")}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}

      {recordsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search
            ? t("assetLists.noMatch", "Nothing matches that")
            : t("assetRecords.empty", "Nothing added yet")}
        />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            // The first two details this TYPE asks for, so a row says something
            // about the thing rather than only its name.
            const facts = detailRowsForKind(shape, r.details).filter((d) => d.value).slice(0, 2)
            return (
              <div key={r.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                <button
                  onClick={() => router.push(`/assets/${r.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                    <Package className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {r.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[r.locationAddress, ...facts.map((f) => `${f.label} ${f.value}`)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
                {shape.holder.enabled && <HolderBadge record={r} shape={shape} />}
                <AssetRecordDialog
                  spaceId={spaceId}
                  kind={kind}
                  existing={r}
                  onSaved={refresh}
                  trigger={
                    <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                  }
                />
                <button onClick={() => del.mutate(r.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Who has this one — under whatever the type calls them, and how many. */
function HolderBadge({ record, shape }: { record: AssetRecord; shape: KindShape }) {
  const { t } = useTranslation()
  const label = kindHolderLabel(shape, t("assetRecords.holder", "Held by"))
  // Falls back to the old single columns for a record the list has not
  // refetched yet, so the badge never blinks to "Free" mid-refresh.
  const count = record.holders?.length ?? (record.holderUserId || record.customerId ? 1 : 0)

  if (count > 0) {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <User className="h-3 w-3" /> {label}
        {/* The number only when there is more than one — "Resident 1" reads as
            a name, and every single-holder list would grow a pointless digit. */}
        {count > 1 && <span className="tabular-nums opacity-70">{count}</span>}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground">
      {t("assetRecords.free", "Nobody")}
    </Badge>
  )
}
