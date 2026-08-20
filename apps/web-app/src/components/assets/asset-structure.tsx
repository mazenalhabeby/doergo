"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Loader2, Package, Plus } from "lucide-react"

import { assetsApi, type StructureNode } from "@/lib/api"
import { formatCents } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What this machine is made of, and what it has cost.
 *
 * The WHOLE breakdown, not a level per click: somebody at a press needs to see
 * that the fault is two levels down, and walking it a request at a time makes
 * that a series of guesses. Money rolls up, because "what has this press cost"
 * has to include its pump — otherwise the number is wrong in exactly the
 * direction that matters, with every sub-unit's spend invisible at the level
 * anybody actually looks at.
 */
export function AssetStructure({ assetId, kindId }: { assetId: string; kindId?: string | null }) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const structureQ = useQuery({
    queryKey: ["asset-structure", assetId],
    queryFn: () => assetsApi.getStructure(assetId),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["asset-structure", assetId] })
    qc.invalidateQueries({ queryKey: ["asset", assetId] })
  }

  if (structureQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    )
  }

  const { tree = [], path = [], rollup } = structureQ.data ?? {}
  const hasSpend = !!rollup && (rollup.inCents > 0 || rollup.outCents > 0)

  return (
    <div className="space-y-3">
      {path.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <button onClick={() => router.push(`/assets/${p.id}`)} className="hover:text-foreground hover:underline">
                {p.name}
              </button>
              <ChevronRight className="h-3 w-3" />
            </span>
          ))}
          <span className="text-foreground">{t("assetStructure.here", "here")}</span>
        </nav>
      )}

      {/* What the whole thing has cost, and how much of that was this level.
          The split is the useful part: "€1,180 — of which €465 on this one"
          tells you where the money actually went. */}
      {hasSpend && rollup && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Roll
            label={t("assetStructure.totalOut", "Spent, all of it")}
            value={formatCents(rollup.outCents)}
            sub={t("assetStructure.ofWhichOwn", "{{amount}} on this one", { amount: formatCents(rollup.ownOutCents) })}
          />
          {rollup.inCents > 0 && (
            <Roll
              label={t("assetStructure.totalIn", "Earned, all of it")}
              value={formatCents(rollup.inCents)}
              sub={t("assetStructure.ofWhichOwn", "{{amount}} on this one", { amount: formatCents(rollup.ownInCents) })}
            />
          )}
          <Roll
            label={t("assetStructure.records", "Inside")}
            value={String(rollup.records)}
            sub={t("assetStructure.recordsSub", "at every level")}
          />
        </div>
      )}

      {tree.length === 0 && addingTo === null ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {t("assetStructure.emptyShort", "Nothing inside this one yet.")}
          </p>
          <Button size="sm" className="mt-3" onClick={() => setAddingTo(assetId)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("assetStructure.addInside", "Add one inside")}
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {tree.map((node) => (
            <Branch
              key={node.id}
              node={node}
              depth={0}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
              kindId={kindId}
              onAdded={refresh}
            />
          ))}
          {addingTo !== assetId && (
            <button
              onClick={() => setAddingTo(assetId)}
              className="flex items-center gap-1.5 px-2 py-2 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> {t("assetStructure.addInside", "Add one inside")}
            </button>
          )}
        </div>
      )}

      {addingTo === assetId && (
        <AddInside
          parentId={assetId}
          kindId={kindId}
          onDone={() => { setAddingTo(null); refresh() }}
          onCancel={() => setAddingTo(null)}
        />
      )}
    </div>
  )
}

/** One node and everything under it. Collapsible, because a press is deep. */
function Branch({
  node, depth, addingTo, setAddingTo, kindId, onAdded,
}: {
  node: StructureNode
  depth: number
  addingTo: string | null
  setAddingTo: (id: string | null) => void
  kindId?: string | null
  onAdded: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  // Open by default: the whole point is seeing the breakdown at once. Deep
  // levels start closed so a large machine does not arrive as a wall.
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn("flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground", !hasChildren && "invisible")}
          aria-label={open ? t("common.collapse", "Collapse") : t("common.expand", "Expand")}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          <Package className="h-3.5 w-3.5" />
        </span>

        <button onClick={() => router.push(`/assets/${node.id}`)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm text-foreground group-hover:text-primary">{node.name}</span>
          {node.serialNumber && (
            <span className="block truncate text-[11px] text-muted-foreground">{node.serialNumber}</span>
          )}
        </button>

        {hasChildren && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t("assetStructure.inside", "{{count}} inside", { count: node.children.length })}
          </span>
        )}

        <button
          onClick={() => setAddingTo(node.id)}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          aria-label={t("assetStructure.addInside", "Add one inside")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {addingTo === node.id && (
        <div style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}>
          <AddInside
            parentId={node.id}
            kindId={kindId}
            onDone={() => { setAddingTo(null); onAdded() }}
            onCancel={() => setAddingTo(null)}
          />
        </div>
      )}

      {open && node.children.map((c) => (
        <Branch
          key={c.id}
          node={c}
          depth={depth + 1}
          addingTo={addingTo}
          setAddingTo={setAddingTo}
          kindId={kindId}
          onAdded={onAdded}
        />
      ))}
    </div>
  )
}

/**
 * Create a sub-unit in place.
 *
 * Two calls, deliberately: create it, then put it where it belongs. Creating a
 * record already had a home; adding a parentId to that endpoint would have put
 * a second way to build structure beside the one that already refuses cycles.
 */
function AddInside({
  parentId, kindId, onDone, onCancel,
}: {
  parentId: string
  kindId?: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")

  const add = useMutation({
    mutationFn: async () => {
      const made = await assetsApi.createAsset({ name: name.trim(), categoryId: kindId ?? undefined })
      if (!made?.id) throw new Error(t("assetStructure.addFailed", "Could not add it"))
      await assetsApi.setParent(made.id, parentId)
    },
    onSuccess: () => { setName(""); onDone() },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="my-1 flex items-center gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim() && !add.isPending) add.mutate()
          if (e.key === "Escape") onCancel()
        }}
        placeholder={t("assetStructure.namePh", "Hydraulic unit, Pump, Motor…")}
        className="h-8 max-w-xs text-sm"
      />
      <Button size="sm" className="h-8" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.add", "Add")}
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        {t("common.cancel", "Cancel")}
      </Button>
    </div>
  )
}

function Roll({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}
