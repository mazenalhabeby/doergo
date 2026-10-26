"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Package, Plus, Pencil, Trash2 } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { normalizeKindShape, kindHolderLabel, canManageAssetsIn } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "../common/section-header"
import { AssetKindDialog } from "./asset-kind-dialog"
import { ContractDialog } from "@/components/assets/contract-dialog"
import { ProposalQueue } from "@/components/assets/proposal-queue"
import { OrphanAssetsCard } from "./orphan-assets-card"
import { keys } from "@/lib/query-keys"
import { KindContents } from "./kind-contents"

/**
 * What this space owns.
 *
 * The kinds belong to the SPACE: this office's "Apartments" and the depot's
 * "Vehicles" are separate lists. Adding the individual ones inside a kind is
 * the next step; this screen is where the kinds are set up.
 */
export function AssetsTab({
  spaceId,
  allProposals = false,
}: {
  spaceId: string
  /**
   * Show every proposal the caller may decide, not only this workspace's.
   * For when this is the ONLY workspace with assets and no "All" view exists —
   * otherwise a page for a kind in no workspace would be on no screen at all.
   */
  allProposals?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const router = useRouter()
  const { user } = useAuth()
  /*
    The contract flow — and the proposals queue, which accepts THROUGH it — ask
    IN THIS workspace. A Space Manager holds `canManageAssets` in their own
    depot, and the server accepts that grant for this workspace's kinds and for
    the pages meant for it; asking the org-wide flag here hid both from exactly
    the person at the desk when the agreement arrives. `canManageAssetsIn`
    already treats an admin and a pre-capability token as org-wide.
  */
  const canUseContracts = canManageAssetsIn(user, spaceId)
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
    /*
      No `tab=assets` any more.

      That existed to keep the space's settings page on this tab across the
      replace. The tab has moved to its own page, so the parameter now names
      nothing — and this component is mounted from both places, so writing it
      would leave a dead parameter in the address of the one that has no tabs.
    */
    if (id) next.set("type", id)
    else next.delete("type")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const kindsQ = useQuery({
    queryKey: keys.assets.kinds(spaceId),
    queryFn: () => assetsApi.getCategories(spaceId),
  })
  const kinds = kindsQ.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.assets.kinds(spaceId) })

  const del = useMutation({
    mutationFn: (id: string) => assetsApi.deleteCategory(id),
    onSuccess: () => {
      notify.success(t("assetKinds.removed", "Removed"))
      invalidate()
    },
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
          <div className="flex items-center gap-2">
            {/*
              Only where something in this workspace is actually HELD by a
              member. A contract hands a thing to somebody; a workspace of
              apartments with no member holder has nobody to hand one to, and
              offering the button there is a dead end three clicks deep.
            */}
            {canUseContracts &&
              kinds.some((k: AssetCategory) => {
                const shape = normalizeKindShape(k.config)
                return shape.holder.enabled && shape.holder.members
              }) && (
                <ContractDialog
                  kinds={kinds}
                  spaceId={spaceId}
                  onCreated={(id) => {
                    invalidate()
                    router.push(`/assets/${id}`)
                  }}
                  trigger={
                    <Button size="sm" variant="outline">
                      <FileText className="mr-1.5 h-4 w-4" /> {t("contract.button", "From a contract")}
                    </Button>
                  }
                />
              )}
            {/* Creating a type is a write (`canManageAssets` in this workspace); a viewer sees the list only. */}
            {canUseContracts && (
              <AssetKindDialog
                spaceId={spaceId}
                onSaved={invalidate}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" /> {t("assetKinds.add", "New type")}
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      {/*
        Pages members have sent in that look like new assets. Above everything,
        because it is somebody WAITING — a driver who photographed a rental
        agreement at a desk and cannot do anything else until this is answered.

        Renders nothing at all when empty, and only for people who could act.

        It lives HERE rather than on the Assets page beside the expense queue
        because reviewing one needs the workspace's KINDS — the reviewer has to
        say what sort of thing this is — and this is the component that has
        them. It therefore appears on both surfaces that show assets, which is
        two chances to notice somebody waiting rather than a duplicate.

        Only THIS workspace's: a page for another depot's kind cannot be decided
        with this tab's kinds.
      */}
      {canUseContracts && <ProposalQueue kinds={kinds} spaceId={allProposals ? undefined : spaceId} />}

      {/* Assets that belong to no space, and so show on no other screen. Above
          the types rather than below them: it is a problem to clear, not a
          section to browse, and nothing under a list of cards gets read. */}
      <OrphanAssetsCard spaceId={spaceId} types={kinds} />

      {kindsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
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
              <div
                key={kind.id}
                className={
                  "group relative rounded-[22px] border border-border bg-card p-[18px] shadow-shell " +
                  "transition-colors hover:border-primary/40"
                }
              >
                <button onClick={() => showKind(kind.id)} className="block w-full text-left">
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] " +
                        "bg-shell-accent-soft text-shell-accent"
                      }
                    >
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
                    ) : (
                      bits.map((b) => (
                        <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {b}
                        </span>
                      ))
                    )}
                  </div>
                </button>

                {/* Kept out of the button: a link wrapping a button is invalid,
                    and nesting them makes the hit areas fight. */}
                {canUseContracts && (
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
