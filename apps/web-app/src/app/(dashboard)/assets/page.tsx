"use client"

/**
 * Assets, at their own address.
 *
 * The body is the workspace's Assets tab — the same component, so kinds, records
 * and the dialogs behave identically wherever you open them from.
 *
 * What was here before was a flat list from an earlier model, with an "Add
 * asset" button wired to nothing, and it was linked from nowhere in the app: no
 * nav item, no button, anywhere. Assets were reachable only through Spaces → a
 * workspace → Configure → Assets, which is the four-click journey this page
 * exists to remove.
 *
 * "All workspaces" is a FINDER, not a second register: an asset KIND belongs to
 * a workspace, so kinds, adding and editing stay behind a workspace tab. All
 * answers "where is GM-HBC-42?" without knowing which depot it is in. Where only
 * one workspace has assets on there is nothing to choose, and it opens there.
 */
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Package } from "lucide-react"
import { canManageAssetsIn } from "@hbcfield/shared/client"

import { assetsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

import { useSpaceScope } from "@/hooks/use-space-scope"
import { SpaceTabs } from "@/components/space-tabs"
import { AssetsTab } from "../locations/[id]/_components/assets-tab"
import { ExpenseQueue } from "@/components/assets/expense-queue"
import { AllAssetsList } from "@/components/assets/all-assets-list"
import { ProposalQueue } from "@/components/assets/proposal-queue"

export default function AssetsPage() {
  const { t } = useTranslation()
  const scope = useSpaceScope({ module: "assets", allowAll: true })
  // One workspace: nothing to choose, so it opens there rather than on a finder of one.
  const spaceId = scope.spaceId ?? (scope.spaces.length === 1 ? scope.spaces[0].id : null)
  const space = scope.spaces.find((s) => s.id === spaceId) ?? null
  const spaceNames = Object.fromEntries(scope.spaces.map((s) => [s.id, s.name]))

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-4">
        <h1 data-tour="page-assets" className="text-2xl font-semibold text-foreground">{t("assets.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {space ? space.name : t("assets.all.subtitle", "Every asset in your workspaces — search to find one")}
        </p>
      </div>

      {/*
        Receipts sent in from phones, waiting on somebody here. Above the
        workspace tabs because it is ORG-WIDE — a queue filtered to the tab you
        happen to be looking at is a queue that hides work.

        Renders nothing at all when it is empty: a permanent empty panel teaches
        people to stop looking at that part of the screen.
      */}
      <ExpenseQueue />

      {scope.showTabs && (
        <SpaceTabs
          spaces={scope.spaces.map((s) => ({ id: s.id, name: s.name }))}
          value={scope.spaceId}
          onChange={scope.setSpaceId}
          showAll
        />
      )}

      {/*
        Nothing to show is a real state here, not a loading one: an organization
        can have the module on and no workspace using it yet.
      */}
      {scope.ready && scope.spaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("assets.noWorkspace", "No workspace has assets switched on yet.")}
          </p>
        </div>
      ) : spaceId ? (
        /*
          The only workspace, with no "All" tab to fall back to: its queue
          keeps every proposal the caller may decide, so one for a kind in no
          workspace still has somewhere to be seen.
        */
        <AssetsTab spaceId={spaceId} allProposals={!scope.showTabs} />
      ) : scope.ready ? (
        <>
          <AllProposals />
          <AllAssetsList spaceNames={spaceNames} />
        </>
      ) : null}
    </div>
  )
}

/**
 * Every proposal the caller may decide, on "All workspaces".
 *
 * ⚠️ NOT A DUPLICATE OF THE TAB'S QUEUE. A workspace tab shows only that
 * workspace's own, so a page whose kind belongs to no workspace — or one sent
 * by a member assigned nowhere, with no kind chosen — is on no tab at all. This
 * is where it is found; without it that page would wait for ever. The kinds are
 * the whole organization's, narrowed in the review dialog to the ones this
 * reviewer manages, exactly as the server narrows accepting.
 */
function AllProposals() {
  const { user } = useAuth()
  const mayDecide = canManageAssetsIn(user)
  const kindsQ = useQuery({
    queryKey: ["space-asset-kinds", "all"],
    queryFn: () => assetsApi.getCategories(),
    enabled: mayDecide,
  })
  if (!mayDecide) return null
  return <ProposalQueue kinds={kindsQ.data ?? []} />
}
