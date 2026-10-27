"use client"

import { useTranslation } from "react-i18next"
import type { ApprovalItem } from "@hbcfield/shared/client"
import { Chip } from "@/components/page/page-kit"

/** Leave asked for days that are all over already — said quietly, so it is decided knowing that. */
export function DatesPassedTag({ item, className }: { item: Pick<ApprovalItem, "data">; className?: string }) {
  const { t } = useTranslation()
  if (item.data.datesPassed !== true) return null
  return <Chip className={className}>{t("approvals.datesPassed")}</Chip>
}
