"use client"

import { useTranslation } from "react-i18next"
import { type ApprovalItem } from "@hbcfield/shared/client"
import { formatTimeAgo } from "@/lib/format-date"
import { UserAvatar } from "@/components/common/user-avatar"
import { Chip, ROW } from "@/components/page/page-kit"
import { nameParts } from "./name-parts"
import { describeItem } from "../_lib/describe"
import { DatesPassedTag } from "./dates-passed-tag"

/** One decision in the inbox list: who, which kind (coral when it cannot wait), the headline, how long it waited. */
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
  const text = describeItem(item, t, orgCurrency)
  const lead = text.facts[0]
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        data-approval-key={`${item.kind}:${item.id}`}
        className={ROW}
      >
        <UserAvatar
          soft
          {...nameParts(item.subject.name)}
          avatarUrl={item.subject.avatarUrl}
          seed={item.subject.id ?? item.subject.name}
          size="md"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex min-w-0 items-center gap-2">
            <b className="truncate text-sm font-semibold text-foreground">
              {item.subject.name || t("approvals.someone")}
            </b>
            <Chip tone={item.group === "NOW" ? "crit" : "soft"}>{t(`approvals.kinds.${item.kind}`)}</Chip>
            {/* An office rule: one approval is in, the item waits for a second person holding the role. */}
            {item.step && <Chip tone="warn">{t("approvals.step.badge", { role: item.step.roleName })}</Chip>}
            {item.step?.waitsForYou && <Chip tone="crit">{t("approvals.yours")}</Chip>}
            <DatesPassedTag item={item} />
            {item.raisedAt && (
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatTimeAgo(item.raisedAt)}
              </span>
            )}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {text.headline}
            {lead ? ` · ${lead.value}` : ""}
            {item.space ? ` · ${item.space.name}` : ""}
          </span>
        </span>
      </button>
    </li>
  )
}
