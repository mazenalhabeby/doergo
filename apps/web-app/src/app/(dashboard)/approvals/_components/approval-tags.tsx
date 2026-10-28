"use client"

import { useTranslation } from "react-i18next"
import { approvalTags, type ApprovalItem, type ApprovalTag } from "@hbcfield/shared/client"
import { Chip } from "@/components/page/page-kit"

/**
 * One mark ("Waiting for you" / "Dates passed") — the same chip and words wherever it shows (`approvals.tag.*`, the
 * phone's keys). "Waiting for you" is the accent: coral is for what cannot wait.
 */
export function ApprovalTagChip({ tag }: { tag: ApprovalTag }) {
  const { t } = useTranslation()
  return <Chip tone={tag === "waitsForYou" ? "accent" : "soft"}>{t(`approvals.tag.${tag}`)}</Chip>
}

/** An item's marks, in the shared order (`approvalTags`). */
export function ApprovalTagChips({ item }: { item: Pick<ApprovalItem, "data" | "step"> }) {
  return (
    <>
      {approvalTags(item).map((tag) => (
        <ApprovalTagChip key={tag} tag={tag} />
      ))}
    </>
  )
}
