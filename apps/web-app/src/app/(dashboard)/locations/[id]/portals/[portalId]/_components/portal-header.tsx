"use client"

import { useTranslation } from "react-i18next"
import { ArrowLeft, Ticket, Repeat } from "lucide-react"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Chip, PageHeader } from "@/components/page/page-kit"
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
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 gap-1.5 rounded-full text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("portal.title", "Client portals")}
      </Button>

      {/* Header — the page kit's title row, the portal's tile beside it. */}
      <div className="flex items-start gap-3.5">
        <div
          className={`mt-1 grid size-12 shrink-0 place-items-center rounded-[14px] text-sm font-semibold ${portalTile(
            meta.accent,
          )}`}
        >
          {personInitials(portal?.name)}
        </div>
        <PageHeader
          className="min-w-0 flex-1"
          title={
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="truncate">{portal?.name || "…"}</span>
              {portal && <Chip className={portalTile(meta.accent)}>{t(`portal.type.${meta.key}`, meta.badge)}</Chip>}
            </span>
          }
          subtitle={
            <>
              <span className="capitalize">{t("portal.entityIs", "Entity: {{e}}", { e: portal?.entityLabel })}</span>
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{openCount}</span>{" "}
              {t("portal.statOpen", "open")}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{requestCount}</span>{" "}
              {t("portal.statTotal", "total")}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{clientCount}</span>{" "}
              {t("portal.tabClients", "Clients").toLowerCase()}
            </>
          }
          actions={
            <>
              {mayManage && (
                <Button variant="outline" size="pill" onClick={onChangeType}>
                  <Repeat />
                  {t("portal.changeType", "Change type")}
                </Button>
              )}
              {mayInvite && (
                <Button size="pillLg" onClick={onInvite}>
                  <Ticket />
                  {t("portal.inviteResident", "Invite client")}
                </Button>
              )}
            </>
          }
        />
      </div>
    </>
  )
}
