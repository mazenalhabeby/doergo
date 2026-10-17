"use client"

import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"
import { ChevronDown, ChevronUp, Clock, Mail, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { roleBadge } from "@/lib/role-badge"
import type { invitationsApi } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type PendingInvitation = NonNullable<Awaited<ReturnType<typeof invitationsApi.list>>>["data"][number]

/** Codes handed out and not yet used, collapsible, each revocable. */
export function PendingInvitations({
  pendingInvitations, showPending, onToggle, onRevoke, revoking,
}: {
  pendingInvitations: PendingInvitation[]
  showPending: boolean
  onToggle: () => void
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  const { t } = useTranslation()
  return (
          <div className="mt-4 bg-card rounded-xl border border-border/80 overflow-hidden">
            <button
              type="button"
              onClick={onToggle}
              className="flex items-center justify-between w-full px-5 py-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("members.pendingInvitations.title")}
                </span>
                <Badge variant="secondary" className="text-xs font-normal ml-1">
                  {pendingInvitations.length}
                </Badge>
              </div>
              {showPending ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showPending && (
              <div className="divide-y divide-border/60 border-t border-border/60">
                {pendingInvitations.map((inv) => {
                  const roleConf = roleBadge(inv.targetRole, { isExternal: inv.isExternal })
                  const expiresDate = new Date(inv.expiresAt)
                  const isExpired = expiresDate < new Date()
                  return (
                    <div
                      key={inv.id}
                      className="group flex items-center gap-4 px-5 py-3 hover:bg-accent/30 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-muted/80 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono font-medium text-foreground tracking-wide">
                          {inv.code || "******"}
                        </p>
                        {inv.createdBy && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("members.pendingInvitations.createdBy", { name: personName(inv.createdBy) })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn("text-xs font-medium border", roleConf.className)}>
                        {t(roleConf.labelKey)}
                      </Badge>
                      <span className={cn(
                        "text-xs whitespace-nowrap",
                        isExpired ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {isExpired
                          ? t("members.pendingInvitations.expired")
                          : t(
                            "members.pendingInvitations.expires",
                            { date: expiresDate.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })
                        }
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRevoke(inv.id)}
                        disabled={revoking}
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                        title={t("members.pendingInvitations.revoke")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
  )
}
