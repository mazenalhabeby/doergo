"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { Inbox, Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** Whether this is the workspace that catches work belonging to no particular one, and the button to make it so. */
export function DefaultWorkspaceCard({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [makingDefault, setMakingDefault] = useState(false)
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            {t("locations.default.title", "Default workspace")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {space.isDefault
              ? t("locations.default.isCurrent", "Work that belongs to no particular workspace lands here.")
              : t(
                  "locations.default.canBe",
                  "Make this the workspace that catches work belonging to no particular one.",
                )}
          </p>
        </div>
        {space.isDefault ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {t("locations.default.badge", "Default")}
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={makingDefault || !!space.isRemote}
            onClick={async () => {
              setMakingDefault(true)
              try {
                await locationsApi.makeDefault(space.id)
                notify.success(
                  t("locations.default.done", "{{name}} is now the default workspace.", { name: space.name }),
                )
                // The badge moves on ANOTHER space too, so the list is
                // invalidated as well as this space.
                queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
                queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
              } catch (e) {
                notify.error(e instanceof Error ? e.message : String(e))
              } finally {
                setMakingDefault(false)
              }
            }}
          >
            {makingDefault && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t("locations.default.make", "Make default")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
