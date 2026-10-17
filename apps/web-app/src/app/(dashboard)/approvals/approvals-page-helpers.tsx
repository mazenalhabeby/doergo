"use client"

import { useTranslation } from "react-i18next"
import dynamic from "next/dynamic"
import { type ApprovalItem, type ApprovalT, describeApproval } from "@hbcfield/shared/client"
import { dateLocale, formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { nameParts } from "./_components/name-parts"

/** ApprovalsPage's module-level helpers, moved here unchanged so its sections can read them too. */
// Opened by a button: never part of the first load.
export const RulesDialog = dynamic(() => import("./_components/rules-dialog").then((m) => m.RulesDialog), { ssr: false })

export const StandInDialog = dynamic(() => import("./_components/stand-in-dialog").then((m) => m.StandInDialog), { ssr: false })

export function RailItem({
  active,
  label,
  count,
  urgent,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  urgent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
          urgent ? "bg-red-600 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

export function Row({
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
