"use client"

import { ArrowLeft, Trash2, Ticket, AlertTriangle, Repeat, Building2 } from "lucide-react";
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PortalDetailPageState } from "../_hooks/use-portal-detail-page"
import { PortalDetailTabs } from "./portal-detail-tabs"
import { PortalCoverPanel } from "./portal-cover-panel"

/** Part of PortalDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function PortalDetailPagePortal({ vm }: { vm: PortalDetailPageState }) {
  const {
    backToSpace,
    t,
    meta,
    portal,
    openCount,
    requestCount,
    clientCount,
    mayManage,
    setTypePickerOpen,
    mayInvite,
    setInviteOpen,
    ownerSpaceName,
    user,
    setDelConfirmText,
    setDelPortalOpen,
  } = vm
  return (
    <div className="max-w-screen-lg mx-auto px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={backToSpace}>
        <ArrowLeft className="h-4 w-4" />{t("portal.title", "Client portals")}
      </Button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold ${portalTile(
              meta.accent)}`}>{personInitials(portal?.name)}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground tracking-tight truncate">{portal?.name || "…"}</h1>
              {portal &&
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(
                    meta.accent)}`}>{t(`portal.type.${meta.key}`, meta.badge)}</span>}
            </div>
            <p
              className="mt-1 text-sm text-muted-foreground capitalize">{t(
                "portal.entityIs",
                "Entity: {{e}}",
                { e: portal?.entityLabel })}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{openCount}</span> {t("portal.statOpen", "open")}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground tabular-nums">{requestCount}</span> {t("portal.statTotal", "total")}
              <span className="mx-1.5 text-border">·</span>
              <span
                className="font-medium text-foreground tabular-nums">{clientCount}</span> {t("portal.tabClients", "Clients").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mayManage && (
            <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => setTypePickerOpen(true)}>
              <Repeat className="h-4 w-4" />{t("portal.changeType", "Change type")}
            </Button>
          )}
          {mayInvite &&
            <Button
              onClick={() => setInviteOpen(true)}
              className="h-11 rounded-xl shadow-sm gap-1.5"><Ticket
                className="h-4 w-4"
              />{t("portal.inviteResident", "Invite client")}</Button>}
        </div>
      </div>

      <PortalCoverPanel vm={vm} />

      {/* This portal belongs to its space — requests route here automatically
          (inheriting the space's flow). No cross-space re-pointing. */}
      <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-border bg-muted/30 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <p className="min-w-0 text-sm text-muted-foreground">
          {t("portal.routesToThisSpace", "Requests route to")}{" "}
          <span className="font-medium text-foreground">{ownerSpaceName || t("portal.thisSpace", "this workspace")}</span>
          {" "}{t("portal.andItsFlow", "and inherit its workflow.")}
        </p>
      </div>

      <PortalDetailTabs vm={vm} />

      {/* Danger zone — deleting is managing, and closed to external members (the route says both). */}
      {portal && mayManage && user?.isExternal !== true && (
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
              className={"flex flex-col gap-3 rounded-xl border border-destructive/30 " +
                "bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center " +
                "sm:justify-between"}>
              <div className="pr-4">
                <p className="text-sm font-medium text-foreground">{t("portal.deletePortalTitle", "Delete this portal")}</p>
                <p
                  className="mt-0.5 text-xs text-muted-foreground">{t(
                    "portal.deletePortalWarn",
                    ("Deleting removes the portal and its categories. Clients keep their " + "accounts but lose portal access."))}</p>
              </div>
              <Button variant="destructive" className="shrink-0" onClick={() => { setDelConfirmText(""); setDelPortalOpen(true) }}>
                <Trash2 className="mr-2 h-4 w-4" />{t("portal.deletePortalButton", "Delete portal")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
