"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Inbox } from "lucide-react"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { useRouteAccess } from "@/hooks/use-route-access"

/**
 * Everything waiting for the member to decide — one count beside the bell.
 *
 * Rendered only for somebody who can decide at least one kind; the count waits
 * for the page's own first load (it is never what the first paint needs), and
 * socket events that add or settle a decision refresh it (use-realtime-sync).
 * Red when something cannot wait (a person out of the ring right now, extra
 * time on a running shift), amber otherwise.
 */
export function ApprovalsButton() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { may } = useRouteAccess()
  const allowed = may("/approvals")
  const afterFirstLoad = useAfterFirstLoad(1)

  const { data } = useQuery({
    queryKey: keys.approvals.count(),
    queryFn: approvalsApi.count,
    enabled: allowed && afterFirstLoad,
    staleTime: 30_000,
    // A fallback for events nobody announces (an overtime round timing out).
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  })

  if (!allowed) return null
  const total = data?.total ?? 0
  const urgent = (data?.now ?? 0) > 0
  const active = pathname === "/approvals"

  return (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn("relative rounded-lg", active && "bg-accent")}
        >
          <Link href="/approvals" title={t("approvals.title")} aria-label={t("approvals.navLabel", { count: total })}>
            <Inbox className="h-5 w-5 text-muted-foreground" />
            {total > 0 && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1",
                  "text-[10px] font-bold tabular-nums text-white ring-2 ring-background",
                  urgent ? "bg-red-600" : "bg-amber-500",
                )}
              >
                {total > 99 ? "99+" : total}
              </span>
            )}
          </Link>
        </Button>
  )
}
