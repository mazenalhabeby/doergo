import { APPROVAL_GROUPS, type ApprovalDay, type ApprovalItem } from "@hbcfield/shared/client"
import { itemKey } from "./approval-keys"

/** The inbox list's keys in the order it is drawn: per group (now, today, later), its days first, then its items. */
export function listOrder(days: ApprovalDay[], items: ApprovalItem[]): string[] {
  return APPROVAL_GROUPS.flatMap((g) => [
    ...days.filter((d) => d.group === g).map((d) => d.key),
    ...items.filter((i) => i.group === g).map(itemKey),
  ])
}
