"use client"

/**
 * Client portals, at their own address.
 *
 * The body is the workspace's Portal tab, unchanged — creating, previewing and
 * opening a portal all behave as they do inside the workspace, because it is
 * the same component.
 *
 * A portal belongs to exactly one workspace, so there is no "All" here: the
 * screen opens on a workspace and the tabs move between them. That is also why
 * this had no top-level entry before — but "it belongs to a workspace" is a fact
 * about the data, not a reason to bury the screen four clicks deep.
 */
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { LayoutTemplate } from "lucide-react"

import { useSpaceScope } from "@/hooks/use-space-scope"
import { useAuth } from "@/contexts/auth-context"
import { SpaceTabs } from "@/components/space-tabs"
import { PortalTab } from "../locations/[id]/_components/portal-tab"

export default function PortalsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  // `b2c_portal` is what puts a portal on a workspace; CRM is its prerequisite,
  // enforced where modules are chosen rather than restated here.
  const scope = useSpaceScope({ module: "b2c_portal", allowAll: false })
  // A space's own module list wins; an absent one inherits the organization's —
  // the same precedence the server's gate applies.
  const hasAssets = ((scope.space?.enabledModules as string[] | null) ?? user?.orgModules ?? []).includes("assets")

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("portal.title", "Client portal")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope.space ? scope.space.name : t("portal.subtitle", "What your clients see when they log in.")}
        </p>
      </div>

      {scope.showTabs && (
        <SpaceTabs
          spaces={scope.spaces.map((s) => ({ id: s.id, name: s.name }))}
          value={scope.spaceId}
          onChange={scope.setSpaceId}
          showAll={false}
        />
      )}

      {scope.ready && !scope.spaceId ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <LayoutTemplate className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("portal.noWorkspace", "No workspace has a client portal switched on yet.")}
          </p>
        </div>
      ) : scope.spaceId ? (
        <PortalTab
          spaceId={scope.spaceId}
          /*
            The Apartment entity keeps its apartments in ASSETS — that is where
            they went when units became asset records.

            ⚠️ This was a hard-coded `true`, so the option was always offered and
            the server always refused it, naming a module (`apartments`) the
            product no longer has. A lock that is never applied in the UI and
            always applied on the server is worse than either alone: it turns a
            missing prerequisite into an error message about something that
            cannot be switched on.
          */
          hasApartments={hasAssets}
          /*
            Switching the module on is a workspace setting, so "turn it on" has
            to lead to that workspace's Modules tab — the tab's own callback,
            pointed at where the setting lives.
          */
          onOpenModules={() => router.push(`/locations/${scope.spaceId}?tab=modules`)}
        />
      ) : null}
    </div>
  )
}
