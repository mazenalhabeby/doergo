"use client"

import type { QueryKey } from "@tanstack/react-query"
import type { ApprovalItem, ApprovalKind } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"

/** The kind's own screen reads these — refreshed after a decision made here. */
export const KIND_KEYS: Partial<Record<ApprovalKind, QueryKey[]>> = {
  hours: [keys.attendance.approvals(), keys.attendance.pendingApprovals()],
  away: [keys.attendance.excursions()],
  extraTime: [keys.overtime.pending()],
  overtime: [keys.overtime.pending()],
  outside: [keys.attendance.approvals(), keys.overtime.pending()],
  noShow: [keys.attendance.noShows()],
  issue: [keys.shiftIssues.list()],
  expense: [keys.assets.expensesPending()],
  assetProposal: [keys.assets.proposalsPending()],
  document: [keys.documents.awaitingVerification()],
  join: [keys.people.joinRequests()],
  clientRequest: [keys.portal.allRequests()],
}

export const itemKey = (i: Pick<ApprovalItem, "kind" | "id">) => `${i.kind}:${i.id}`
