"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"

import { spaceRolesApi, spaceMembersApi } from "@/lib/api"
import { RoutingSection } from "./routing-section"
import { roleQueryKey } from "@/components/spaces/work-roles"
import { PeopleSection } from "./members-people"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SubRolesSection } from "./sub-roles-section"

/**
 * A workspace's Members page, in three tabs.
 *
 * It used to be one long scroll — roles above, every member with chips, a rate,
 * Routing, ⋯ and Remove on their row, the add form, then routing — and it grew
 * with every feature. People is the everyday view (a table to read, a side
 * panel to work in); Roles and Notifications are set up once and visited rarely.
 */
export function MembersTab({ spaceId, hasApartments }: { spaceId: string; hasApartments?: boolean }) {
  const { t } = useTranslation()
  const { data: members } = useQuery({
    queryKey: keys.spaceMembers.list(spaceId),
    queryFn: () => spaceMembersApi.list(spaceId),
  })
  const { data: roles } = useQuery({
    queryKey: roleQueryKey(spaceId),
    queryFn: () => spaceRolesApi.listInSpace(spaceId),
  })
  const count = (n?: number) =>
    n != null ? <span className="ml-1.5 text-[11px] text-muted-foreground">{n}</span> : null
  return (
    <Tabs defaultValue="people" className="space-y-4">
      <TabsList className="h-auto rounded-lg border bg-muted/50 p-0.5">
        <TabsTrigger value="people" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.people")}
          {count(members?.length)}
        </TabsTrigger>
        <TabsTrigger value="roles" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.roles")}
          {count(
            roles?.filter((r) => (r.kind === "WORK" ? r.activeHere !== false : r.holders.length > 0 || !r.isSystem))
              .length,
          )}
        </TabsTrigger>
        <TabsTrigger value="notifications" className="rounded-md px-3 py-1.5 text-[13px]">
          {t("scheduling.membersPage.notifications")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="people" className="mt-0">
        <PeopleSection spaceId={spaceId} hasApartments={hasApartments} />
      </TabsContent>
      <TabsContent value="roles" className="mt-0">
        <SubRolesSection spaceId={spaceId} />
      </TabsContent>
      <TabsContent value="notifications" className="mt-0">
        <RoutingSection spaceId={spaceId} />
      </TabsContent>
    </Tabs>
  )
}
