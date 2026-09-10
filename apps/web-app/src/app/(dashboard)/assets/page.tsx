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
 * No "All workspaces" here, deliberately: an asset KIND belongs to a workspace,
 * so a combined view has no coherent list of kinds to show. Choosing is the
 * screen's first act — and where there is only one workspace with assets on,
 * nothing is asked at all.
 */
import { useTranslation } from "react-i18next"
import { Package } from "lucide-react"

import { useSpaceScope } from "@/hooks/use-space-scope"
import { SpaceTabs } from "@/components/space-tabs"
import { AssetsTab } from "../locations/[id]/_components/assets-tab"
import { ExpenseQueue } from "@/components/assets/expense-queue"

export default function AssetsPage() {
  const { t } = useTranslation()
  const scope = useSpaceScope({ module: "assets", allowAll: false })

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-4">
        <h1 data-tour="page-assets" className="text-2xl font-semibold text-foreground">{t("assets.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope.space ? scope.space.name : t("assets.subtitle")}
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
          showAll={false}
        />
      )}

      {/*
        Nothing to show is a real state here, not a loading one: an organization
        can have the module on and no workspace using it yet.
      */}
      {scope.ready && !scope.spaceId ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("assets.noWorkspace", "No workspace has assets switched on yet.")}
          </p>
        </div>
      ) : scope.spaceId ? (
        <AssetsTab spaceId={scope.spaceId} />
      ) : null}
    </div>
  )
}
