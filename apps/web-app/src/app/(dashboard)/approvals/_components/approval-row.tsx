"use client"

import { useTranslation } from "react-i18next"
import { approvalTags, type ApprovalItem } from "@hbcfield/shared/client"
import { formatTimeAgo } from "@/lib/format-date"
import { UserAvatar } from "@/components/common/user-avatar"
import { Chip, ROW } from "@/components/page/page-kit"
import { nameParts } from "./name-parts"
import { describeItem } from "../_lib/describe"

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
        {/* The name comes first and is never pushed out: the tags wrap on their own line under the headline. */}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex min-w-0 items-center gap-2">
            <b className="min-w-0 truncate text-sm font-semibold text-foreground">
              {item.subject.name || t("approvals.someone")}
            </b>
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
          <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Chip tone={item.group === "NOW" ? "crit" : "soft"}>{t(`approvals.kinds.${item.kind}`)}</Chip>
            {/* An office rule: an approval is in, the item still needs somebody holding this role. */}
            {item.step && <Chip tone="warn">{t("approvals.step.badge", { role: item.step.roleName })}</Chip>}
            {/* Its marks (shared, the phone's order): "Waiting for you" in the accent — coral is for what cannot wait. */}
            {approvalTags(item).map((tag) => (
              <Chip key={tag} tone={tag === "waitsForYou" ? "accent" : "soft"}>
                {t(tag === "waitsForYou" ? "approvals.waitsForYou" : "approvals.datesPassed")}
              </Chip>
            ))}
          </span>
        </span>
      </button>
    </li>
  )
}
