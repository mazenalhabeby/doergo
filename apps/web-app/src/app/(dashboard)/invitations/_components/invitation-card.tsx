"use client"

import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { InvitationStatus, type Invitation } from "@/lib/api"
import { formatMediumDateTime } from "@/lib/format-date"
import { notify } from "@/lib/toast"
import { copyText } from "@/lib/clipboard"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"
import { getRoleBadge, getStatusBadge, isExpired } from "./invitation-badges"

/** How much of a pending code's life is used up, 0–100 — the bar under its dates. */
function lifeUsed(createdAt: string, expiresAt: string) {
  const start = new Date(createdAt).getTime()
  const span = new Date(expiresAt).getTime() - start
  if (!(span > 0)) return 100
  return Math.min(100, Math.max(0, ((Date.now() - start) / span) * 100))
}

/** One invitation as the board draws it: who it is for, the code to copy, its dates, what can be done with it. */
export function InvitationCard({ inv, onRevoke }: { inv: Invitation; onRevoke: (inv: Invitation) => void }) {
  const { t } = useTranslation()
  const pending = inv.status === InvitationStatus.PENDING
  const ended = inv.status === InvitationStatus.EXPIRED || inv.status === InvitationStatus.REVOKED
  const lapsed = pending && isExpired(inv.expiresAt)

  const copy = async () => {
    if (inv.code && (await copyText(inv.code))) notify.success(t("common.codeCopiedToClipboard"))
  }

  return (
    <Panel as="div" className={cn("flex flex-col gap-3.5 p-[18px]", ended && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold text-foreground" title={t("invitations.table.role")}>
            {getRoleBadge(inv.targetRole, t)}
          </b>
          {inv.specialty && <span className="text-[12.5px] text-muted-foreground">{inv.specialty}</span>}
        </div>
        <span title={t("invitations.table.status")}>{getStatusBadge(inv.status, t)}</span>
      </div>

      <div
        aria-label={t("invitations.table.code")}
        className="flex items-center justify-between gap-2.5 rounded-[14px] bg-muted px-3.5 py-3"
      >
        {inv.code ? (
          <>
            <b className="font-shell-mono text-[19px] font-semibold tracking-[0.08em] text-foreground">{inv.code}</b>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              className="h-8 rounded-[10px] border-0 bg-card text-[12.5px]"
            >
              <Icon name="link" size={14} />
              {t("common.copy")}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">
        <span>
          {t("invitations.table.created")} {formatMediumDateTime(inv.createdAt)}
          {inv.createdBy && (
            <>
              {" · "}
              {t("invitations.table.createdBy")} {personName(inv.createdBy)}
            </>
          )}
        </span>
        {pending && (
          <div className="h-[5px] overflow-hidden rounded-full bg-shell-chip">
            <i
              className={cn("block h-full rounded-full", lapsed ? "bg-shell-crit" : "bg-foreground")}
              style={{ width: `${lifeUsed(inv.createdAt, inv.expiresAt)}%` }}
            />
          </div>
        )}
        <span className={cn(lapsed && "text-shell-crit")}>
          {t("invitations.table.expires")} {formatMediumDateTime(inv.expiresAt)}
        </span>
        {inv.acceptedBy && (
          <span>
            {t("invitations.table.usedBy")}{" "}
            <span className="font-medium text-foreground">{personName(inv.acceptedBy)}</span> · {inv.acceptedBy.email}
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-auto flex gap-2">
          <Button
            variant="ghost"
            onClick={() => onRevoke(inv)}
            className="h-8 rounded-full px-3.5 text-[13px] text-shell-crit hover:text-shell-crit"
          >
            {t("invitations.revokeDialog.revokeButton")}
          </Button>
        </div>
      )}
    </Panel>
  )
}
