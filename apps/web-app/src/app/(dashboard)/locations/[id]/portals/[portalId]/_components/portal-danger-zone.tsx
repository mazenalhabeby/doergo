"use client"

import { useTranslation } from "react-i18next"
import { Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Danger zone: the way into deleting this portal. */
export function PortalDangerZone({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="mt-10 border-destructive/40">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-base text-destructive">{t("portal.dangerTitle", "Danger zone")}</CardTitle>
            <CardDescription>{t("portal.dangerHint", "Irreversible actions for this portal.")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={
            "flex flex-col gap-3 rounded-xl border border-destructive/30 " +
            "bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center " +
            "sm:justify-between"
          }
        >
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">{t("portal.deletePortalTitle", "Delete this portal")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                "portal.deletePortalWarn",
                "Deleting removes the portal and its categories. Clients keep their " +
                  "accounts but lose portal access.",
              )}
            </p>
          </div>
          <Button variant="destructive" className="shrink-0" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("portal.deletePortalButton", "Delete portal")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
