"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowRight, Inbox } from "lucide-react"
import type { ApprovalKind } from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"

/**
 * Decisions are made in ONE place — Approvals. A page that used to carry its
 * own approve/reject list shows this line instead: how many of ITS kinds wait
 * for the reader, and the way there, filtered to them. Nothing waiting → nothing.
 *
 * Reads the inbox count (cached, shared with the top-bar button), never a list.
 */
export function DecideInApprovals({ kinds, className }: { kinds: ApprovalKind[]; className?: string }) {
  const { t } = useTranslation()
  const { may } = useRouteAccess()
  const allowed = may("/approvals")
  const { data } = useQuery({
    queryKey: keys.approvals.count(),
    queryFn: approvalsApi.count,
    enabled: allowed,
    staleTime: 30_000,
  })
  if (!allowed) return null
  const count = kinds.reduce((n, k) => n + (data?.byKind?.[k] ?? 0), 0)
  if (count === 0) return null
  return (
    <Link
      href={`/approvals?kind=${kinds[0]}`}
      className={`flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 ${className ?? ""}`}
    >
      <Inbox className="size-4 text-primary" />
      <span className="flex-1">{t("approvals.decideThere", { count })}</span>
      <span className="inline-flex items-center gap-1 text-primary">
        {t("approvals.title")}
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}
