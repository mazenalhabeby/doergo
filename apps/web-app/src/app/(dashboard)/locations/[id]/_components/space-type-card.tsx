"use client"

import { useTranslation } from "react-i18next"
import { Boxes, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Workspace (no pin) or physical site (a pin and a geofence) — the badge shows the current choice. */
export function SpaceTypeCard({
  isPhysical,
  setType,
}: {
  isPhysical: boolean
  setType: (type: "workspace" | "physical") => void
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={
                "flex size-9 shrink-0 items-center justify-center rounded-lg " +
                "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
              }
            >
              <Boxes className="h-[18px] w-[18px]" />
            </span>
            <div>
              <CardTitle className="text-base">{t("locations.typeSection")}</CardTitle>
              <CardDescription>{t("locations.typeHint")}</CardDescription>
            </div>
          </div>
          {/* Current definition at a glance */}
          <Badge
            variant="secondary"
            className={cn(
              "gap-1 shrink-0 border-transparent",
              isPhysical
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
            )}
          >
            {isPhysical ? <MapPin className="h-3 w-3" /> : <Boxes className="h-3 w-3" />}
            {isPhysical ? t("locations.form.physical") : t("locations.form.workspace")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setType("workspace")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              !isPhysical
                ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-blue-600" /> {t("locations.form.workspace")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("locations.form.workspaceHint")}</p>
          </button>
          <button
            type="button"
            onClick={() => setType("physical")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              isPhysical
                ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-blue-600" /> {t("locations.form.physical")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("locations.form.physicalHint")}</p>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
