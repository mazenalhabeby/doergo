"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useApprovalsCount } from "./use-approvals-count"
import { CountDot, topBarIcon, topBarIconOn } from "./top-bar-icon"
import { Icon } from "@/components/ui/icon"

/**
 * Everything waiting for the member to decide — one count beside the bell (the count: use-approvals-count.ts).
 * Rendered only for somebody who can decide at least one kind. Coral when something cannot wait (a person out
 * of the ring right now, extra time on a running shift), amber otherwise.
 */
export function ApprovalsButton() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { allowed, total, urgent } = useApprovalsCount()
  if (!allowed) return null
  return (
    <Link
      href="/approvals"
      title={t("approvals.title")}
      aria-label={t("approvals.navLabel", { count: total })}
      aria-current={pathname === "/approvals" ? "page" : undefined}
      data-tour="nav-approvals"
      className={cn(topBarIcon, pathname === "/approvals" && topBarIconOn)}
    >
      <Icon name="inboxLine" />
      <CountDot n={total} tone={urgent ? "crit" : "warn"} />
    </Link>
  )
}
