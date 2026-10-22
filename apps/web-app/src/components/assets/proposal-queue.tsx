"use client"

import { useRouteAccess } from "@/hooks/use-route-access"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react"

import { assetsApi, type AssetCategory, type AssetProposal } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { ProposalRow } from "./proposal-row"
import { ReviewDialog } from "./proposal-review-dialog"

/**
 * Pages members have sent in, waiting on somebody responsible.
 *
 * ⚠️ The driver never created anything. They photographed the agreement they
 * were handed at a desk and it landed here — which is the whole gap this
 * closes, because the alternative is the paper living in a door pocket until
 * somebody types it in March.
 *
 * Sits at the top of the Assets page and renders NOTHING when it is empty: a
 * permanent empty panel teaches people to stop looking at that part of the
 * screen, and this is the one part that must keep being looked at.
 *
 * A Space Manager sees it too. The server narrows the list to what they may
 * decide (`mayReviewProposal` in shared: the kind's workspace, or the member's
 * while no kind is chosen), so nothing here filters proposals — only the kinds
 * offered, below.
 *
 * ⚠️ ON A WORKSPACE'S TAB, ONLY THAT WORKSPACE'S (`spaceId`). A manager of two
 * depots was shown the other depot's van here too, in a kind this tab's picker
 * does not offer — a decision the screen could not make. The server narrows by
 * `proposalInSpace`, the same rule asked of one place; without `spaceId` (the
 * org-wide Assets page) the whole in-scope queue comes back, which is where a
 * page with a kind in no workspace, or from a member assigned nowhere, is found.
 */
export function ProposalQueue({ kinds, spaceId }: { kinds: AssetCategory[]; spaceId?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [reviewing, setReviewing] = useState<AssetProposal | null>(null)

  const mayReview = useRouteAccess().holds("any:canManageAssets")
  const q = useQuery({
    // Prefixed by the shared key, so a decision invalidates every queue at once.
    queryKey: keys.assets.proposalsPending(spaceId ?? "all"),
    queryFn: () => assetsApi.getPendingProposals(spaceId),
    // @RequirePermissionInSpace('canManageAssets') — anyone else is only refused.
    enabled: mayReview,
    // Somebody sends one from a rental desk; the office has this page open.
    refetchInterval: 120_000,
  })

  const proposals = q.data ?? []
  if (q.isLoading || proposals.length === 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.04]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {t("proposals.waiting", "{{count}} documents look like new assets", { count: proposals.length })}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-primary/25 p-3">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onReview={() => setReviewing(p)} />
          ))}
        </div>
      )}

      <ReviewDialog proposal={reviewing} kinds={kinds} onClose={() => setReviewing(null)} />
    </div>
  )
}
