"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { approvalWhyText, type ApprovalItem, type ApprovalT } from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/common/user-avatar"
import { nameParts } from "./name-parts"

/**
 * Why the reader sees this item, who else could decide it, and who is told
 * about the person. Read when the item is opened (one small request), never
 * for the whole list.
 */
export function WhoElse({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation()
  const why = approvalWhyText(item, t as unknown as ApprovalT)
  const { data, isLoading } = useQuery({
    queryKey: keys.approvals.route(item.kind, item.id),
    queryFn: () => approvalsApi.route(item.kind, item.id),
    staleTime: 60_000,
  })

  return (
    <div className="space-y-3 text-sm">
      {why && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{t("approvals.why.title")}: </span>
          {why}
        </p>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("approvals.route.title")}</p>
        {isLoading ? (
          <p className="text-muted-foreground">{t("approvals.route.loading")}</p>
        ) : !data?.deciders.length ? (
          <p className="text-muted-foreground">{t("approvals.route.onlyYou")}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.deciders.map((d) => (
              <li key={d.id} className={cn("flex items-center gap-2", d.onLeave && "opacity-60")}>
                <UserAvatar {...nameParts(d.name)} avatarUrl={d.avatarUrl} seed={d.id} size="sm" />
                <span className="min-w-0 flex-1 truncate text-foreground">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.onLeave ? t("approvals.route.onLeave") : t(`approvals.route.via.${d.via}`)}
                </span>
              </li>
            ))}
            {data.moreDeciders > 0 && (
              <li className="text-xs text-muted-foreground">{t("approvals.route.more", { count: data.moreDeciders })}</li>
            )}
          </ul>
        )}
      </div>
      {!!data?.told.length && (
        <p className="text-xs text-muted-foreground">
          {t("approvals.route.told", { name: item.subject.name })}: {data.told.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  )
}
