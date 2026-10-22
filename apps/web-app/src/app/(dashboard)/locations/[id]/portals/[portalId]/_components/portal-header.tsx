"use client"

import { useTranslation } from "react-i18next"
import { ArrowLeft, Ticket, Repeat } from "lucide-react"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import type { PortalDetail } from "../_lib/portal-types"
import type { TEMPLATES } from "../_lib/portal-templates"

/** Back to the portals, the portal's name, type and entity, its counts, and Change type / Invite client. */
export function PortalHeader({
  portal,
  meta,
  openCount,
  requestCount,
  clientCount,
  mayManage,
  mayInvite,
  onBack,
  onChangeType,
  onInvite,
}: {
  portal: PortalDetail | undefined
  /** The portal's type. */
  meta: (typeof TEMPLATES)[number]
  openCount: number
  requestCount: number
  clientCount: number
  mayManage: boolean
  mayInvite: boolean
  onBack: () => void
  onChangeType: () => void
  onInvite: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        {t("portal.title", "Client portals")}
      </Button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold ${portalTile(
              meta.accent,
            )}`}
          >
            {personInitials(portal?.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground tracking-tight truncate">{portal?.name || "…"}</h1>
              {portal && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(
                    meta.accent,
                  )}`}
                >
                  {t(`portal.type.${meta.key}`, meta.badge)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground capitalize">
              {t("portal.entityIs", "Entity: {{e}}", { e: portal?.entityLabel })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{openCount}</span>{" "}
              {t("portal.statOpen", "open")}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{requestCount}</span>{" "}
              {t("portal.statTotal", "total")}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{clientCount}</span>{" "}
              {t("portal.tabClients", "Clients").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mayManage && (
            <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={onChangeType}>
              <Repeat className="h-4 w-4" />
              {t("portal.changeType", "Change type")}
            </Button>
          )}
          {mayInvite && (
            <Button onClick={onInvite} className="h-11 rounded-xl shadow-sm gap-1.5">
              <Ticket className="h-4 w-4" />
              {t("portal.inviteResident", "Invite client")}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
