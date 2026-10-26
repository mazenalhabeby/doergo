"use client"

import { InvitationStatus } from "@/lib/api"
import { Chip } from "@/components/page/page-kit"

/** How an invitation is shown: the status filter's options, its status and role words, expiry. */
export const STATUS_OPTIONS_KEYS = [
  { value: "all", labelKey: "common.allStatuses" },
  { value: InvitationStatus.PENDING, labelKey: "invitations.status.pending" },
  { value: InvitationStatus.ACCEPTED, labelKey: "invitations.status.accepted" },
  { value: InvitationStatus.EXPIRED, labelKey: "invitations.status.expired" },
  { value: InvitationStatus.REVOKED, labelKey: "invitations.status.revoked" },
] as const

const STATUS_TONE = {
  [InvitationStatus.PENDING]: "warn",
  [InvitationStatus.ACCEPTED]: "accent",
  [InvitationStatus.EXPIRED]: "soft",
  [InvitationStatus.REVOKED]: "crit",
} as const

const STATUS_KEY = {
  [InvitationStatus.PENDING]: "invitations.status.pending",
  [InvitationStatus.ACCEPTED]: "invitations.status.accepted",
  [InvitationStatus.EXPIRED]: "invitations.status.expired",
  [InvitationStatus.REVOKED]: "invitations.status.revoked",
} as const

/** The dot each status wears on the filter pills — the same tone as its chip. */
export const STATUS_DOT: Record<string, string> = {
  [InvitationStatus.PENDING]: "bg-shell-warn",
  [InvitationStatus.ACCEPTED]: "bg-shell-live",
  [InvitationStatus.EXPIRED]: "bg-muted-foreground/50",
  [InvitationStatus.REVOKED]: "bg-shell-crit",
}

export function getStatusBadge(status: InvitationStatus, t: (key: string) => string) {
  if (!(status in STATUS_KEY)) return <Chip>{status}</Chip>
  return (
    <Chip tone={STATUS_TONE[status]} dot>
      {t(STATUS_KEY[status])}
    </Chip>
  )
}

/** The role an invitation brings — a word, not a badge: the card's title. */
export function getRoleBadge(role: string, t: (key: string) => string) {
  return role === "EMPLOYEE" ? t("members.roles.technician") : role
}

export function isExpired(dateStr: string) {
  return new Date(dateStr) < new Date()
}
