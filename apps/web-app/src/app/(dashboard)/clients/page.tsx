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
 *
 * Laid out after docs/design/web-redesign/Clients.dc.html: the title with "Add client" beside it, the
 * workspace row, then the search, the filters and the rows in one panel.
 */
import { useTranslation } from "react-i18next"

import { useSpaceScope } from "@/hooks/use-space-scope"
import { SpaceTabs } from "@/components/spaces/space-tabs"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Chip, PageHeader } from "@/components/page/page-kit"
import { AddCustomerButton, CustomersIntro, CustomersTab } from "../../../components/crm/customers-tab"

export default function ClientsPage() {
  const { t } = useTranslation()
  // `crm` is the module that puts clients in a workspace at all — a workspace
  // without it has none, and offering it would be a tab that leads to nothing.
  const scope = useSpaceScope({ module: "crm" })
  const spaceId = scope.spaceId ?? undefined

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={t("nav.crm", "CRM")}
        subtitle={<CustomersIntro spaceId={spaceId} />}
        actions={<AddCustomerButton spaceId={spaceId} />}
      />

      {scope.showTabs ? (
        <SpaceTabs
          spaces={scope.spaces.map((s) => ({ id: s.id, name: s.name }))}
          value={scope.spaceId}
          onChange={scope.setSpaceId}
          allLabel={t("clients.allSpaces", "All")}
          className="mb-4"
        />
      ) : (
        /*
          Which workspace, said in words when the tabs are not there to say
          it. A single-workspace organization should still know where its
          clients live.
        */
        <div className="mb-4">
          <Chip dot tone={scope.space ? "accent" : "soft"}>
            {scope.space
              ? t("clients.inWorkspace", "In {{name}}", { name: scope.space.name })
              : t("clients.subtitleAll", "Every client in the organization.")}
          </Chip>
        </div>
      )}

      {/* The workspace's own list, mounted here. One implementation. */}
      <CustomersTab spaceId={spaceId} />
    </div>
  )
}
