"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { roleBadge } from "@/lib/role-badge"
import type { invitationsApi } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"

type PendingInvitation = NonNullable<Awaited<ReturnType<typeof invitationsApi.list>>>["data"][number]

/** Codes handed out and not yet used, collapsible, each revocable. */
export function PendingInvitations({
  pendingInvitations,
  onRevoke,
  revoking,
}: {
  pendingInvitations: PendingInvitation[]
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  const { t } = useTranslation()
  const [showPending, setShowPending] = useState(true)
  return (
    <Panel className="mt-3.5 px-5 py-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <h3 className="flex-1 text-[15px] font-semibold text-foreground">
          {t("members.pendingInvitations.title")} · {pendingInvitations.length}
        </h3>
        <Link href="/invitations" className="text-[13px] font-semibold text-shell-accent hover:underline">
          {t("invitations.title")} →
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowPending((p) => !p)}
          aria-expanded={showPending}
          aria-label={t("members.pendingInvitations.title")}
          className="size-8 rounded-full text-muted-foreground"
        >
          <Icon name={showPending ? "chevronUp" : "chevronDown"} size={16} />
        </Button>
      </div>
      {showPending && (
        <div>
          {pendingInvitations.map((inv) => {
            const roleConf = roleBadge(inv.targetRole, { isExternal: inv.isExternal })
            const expiresDate = new Date(inv.expiresAt)
            const isExpired = expiresDate < new Date()
            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center gap-3 border-t border-border py-2.5 text-[13.5px] first:border-t-0"
              >
                <span className="rounded-lg bg-muted px-2.5 py-1 font-shell-mono text-[13px] tracking-[0.04em] text-foreground">
                  {inv.code || "******"}
                </span>
                <span className="min-w-0 flex-1 text-foreground">
                  {t(roleConf.labelKey)}{" "}
                  <span className="text-muted-foreground">
                    {inv.createdBy && (
                      <>· {t("members.pendingInvitations.createdBy", { name: personName(inv.createdBy) })} </>
                    )}
                    ·{" "}
                    <span className={cn(isExpired && "text-shell-crit")}>
                      {isExpired
                        ? t("members.pendingInvitations.expired")
                        : t("members.pendingInvitations.expires", {
                            date: expiresDate.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }),
                          })}
                    </span>
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => onRevoke(inv.id)}
                  disabled={revoking}
                  className="h-8 rounded-full px-3.5 text-[13px] text-shell-crit hover:text-shell-crit"
                >
                  {t("members.pendingInvitations.revoke")}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
