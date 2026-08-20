"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Package } from "lucide-react"

import { assetsApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What this machine is made of, and where it sits.
 *
 * Equipment breaks down into subunits and components to whatever depth it
 * warrants — a pump needs one level, a press needs four — so this walks one
 * level at a time rather than pretending the depth is fixed. A fault logged on
 * the pump stays on the pump, which is the whole point of recording structure.
 */
export function AssetStructure({ assetId }: { assetId: string }) {
  const { t } = useTranslation()
  const router = useRouter()

  const structureQ = useQuery({
    queryKey: ["asset-structure", assetId],
    queryFn: () => assetsApi.getStructure(assetId),
  })

  if (structureQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    )
  }

  const { children, path } = structureQ.data ?? { children: [], path: [] }

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

      {children.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("assetStructure.empty", "Nothing inside this one. Add a record and put it in here from its own page.")}
        </p>
      ) : (
        <div className="space-y-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/assets/${c.id}`)}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                <Package className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{c.name}</span>
                {c.serialNumber && <span className="block truncate text-xs text-muted-foreground">{c.serialNumber}</span>}
              </span>
              {!!c._count?.children && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("assetStructure.inside", "{{count}} inside", { count: c._count.children })}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
