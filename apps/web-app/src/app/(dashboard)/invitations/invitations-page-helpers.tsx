"use client"

import { InvitationStatus } from "@/lib/api"
import { Badge } from "@/components/ui/badge"

/** InvitationsPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const STATUS_OPTIONS_KEYS = [
  { value: "all", labelKey: "common.allStatuses" },
  { value: InvitationStatus.PENDING, labelKey: "invitations.status.pending" },
  { value: InvitationStatus.ACCEPTED, labelKey: "invitations.status.accepted" },
  { value: InvitationStatus.EXPIRED, labelKey: "invitations.status.expired" },
  { value: InvitationStatus.REVOKED, labelKey: "invitations.status.revoked" },
] as const

export function getStatusBadge(status: InvitationStatus, t: (key: string) => string) {
  switch (status) {
    case InvitationStatus.PENDING:
      return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-100">{t("invitations.status.pending")}</Badge>
    case InvitationStatus.ACCEPTED:
      return <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-100">{t("invitations.status.accepted")}</Badge>
    case InvitationStatus.EXPIRED:
      return <Badge className="bg-muted text-muted-foreground hover:bg-accent">{t("invitations.status.expired")}</Badge>
    case InvitationStatus.REVOKED:
      return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-100">{t("invitations.status.revoked")}</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export function getRoleBadge(role: string, t: (key: string) => string) {
  switch (role) {
    case "EMPLOYEE":
      return <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-100">{t("members.roles.technician")}</Badge>
    default:
      return <Badge variant="outline">{role}</Badge>
  }
}

export function isExpired(dateStr: string) {
  return new Date(dateStr) < new Date()
}
