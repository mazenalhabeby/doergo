import type { TFunction } from "i18next"
import { describeApproval, type ApprovalItem, type ApprovalT } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { formatRequestMinutes } from "@/lib/requests"

/** An item's headline and facts in the reader's language — durations as "1 Std. 30 Min.", never English "1h 30m". */
export function describeItem(item: ApprovalItem, t: TFunction, orgCurrency?: string | null) {
  return describeApproval(item, t as unknown as ApprovalT, dateLocale(), orgCurrency, (m) =>
    formatRequestMinutes(m, (key, o) => t(key, o)),
  )
}
