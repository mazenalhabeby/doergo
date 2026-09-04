"use client"

/**
 * Clients, at their own address.
 *
 * The list itself is the workspace's Customers tab — the same component, not a
 * copy of it. This page adds the two things a top-level entry needs: a heading
 * that says whose book you are looking at, and the workspace tabs, which appear
 * only when CRM is on in more than one workspace.
 *
 * Reaching a client used to be Spaces → a workspace → Configure → Customers,
 * and then the same four steps again for the next workspace. The rows have not
 * changed; the route to them has.
 */
import { useTranslation } from "react-i18next"
import { Contact } from "lucide-react"

import { useSpaceScope } from "@/hooks/use-space-scope"
import { SpaceTabs } from "@/components/space-tabs"
import { CustomersTab } from "../locations/[id]/_components/customers-tab"

export default function ClientsPage() {
  const { t } = useTranslation()
  // `crm` is the module that puts clients in a workspace at all — a workspace
  // without it has none, and offering it would be a tab that leads to nothing.
  const scope = useSpaceScope({ module: "crm" })

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Contact className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("nav.crm", "CRM")}</h1>
          <p className="text-xs text-muted-foreground">
            {/*
              Which workspace, said in words when the tabs are not there to say
              it. A single-workspace organization should still know where its
              clients live.
            */}
            {scope.space
              ? t("clients.inWorkspace", "In {{name}}", { name: scope.space.name })
              : t("clients.subtitleAll", "Every client in the organization.")}
          </p>
        </div>
      </div>

      {scope.showTabs && (
        <SpaceTabs
          spaces={scope.spaces.map((s) => ({ id: s.id, name: s.name }))}
          value={scope.spaceId}
          onChange={scope.setSpaceId}
          allLabel={t("clients.allSpaces", "All")}
        />
      )}

      {/* The workspace's own list, mounted here. One implementation. */}
      <CustomersTab spaceId={scope.spaceId ?? undefined} />
    </div>
  )
}
