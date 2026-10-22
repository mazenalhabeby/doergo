"use client"

import { useTranslation } from "react-i18next"
import { type ApprovalItem, type ApprovalT, describeApproval } from "@hbcfield/shared/client"
import { dateLocale, formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/common/user-avatar"
import { nameParts } from "./name-parts"

/** One decision in the inbox list: who, which kind, the headline and how long it has waited. */
export function ApprovalRow({
  item,
  active,
  onSelect,
  orgCurrency,
}: {
  item: ApprovalItem
  active: boolean
  onSelect: () => void
  orgCurrency?: string | null
}) {
  const { t } = useTranslation()
  const text = describeApproval(item, t as ApprovalT, dateLocale(), orgCurrency)
  const lead = text.facts[0]
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <UserAvatar
          {...nameParts(item.subject.name)}
          avatarUrl={item.subject.avatarUrl}
          seed={item.subject.id ?? item.subject.name}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium text-foreground">{item.subject.name || t("approvals.someone")}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t(`approvals.kinds.${item.kind}`)}</span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {text.headline}
            {lead ? ` · ${lead.value}` : ""}
            {item.space ? ` · ${item.space.name}` : ""}
            {item.step ? ` · ${t("approvals.step.short", { role: item.step.roleName })}` : ""}
          </p>
        </div>
        {item.raisedAt && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimeAgo(item.raisedAt)}</span>
        )}
      </button>
    </li>
  )
}
