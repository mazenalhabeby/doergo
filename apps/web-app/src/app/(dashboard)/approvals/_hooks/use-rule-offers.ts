"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { isRuleKind, type RuleInsights, type RuleKind } from "@hbcfield/shared/client"
import type { OfferedRule } from "../_components/rules-tree/suggestion-bar"

/**
 * The rules this page offers for one kind: the ones the last 90 days suggest, and the one an inbox item
 * asked for ("make a rule like this", read once from the link — it also picks the kind). "Not now" hides
 * an offer for this visit.
 */
export function useRuleOffers({
  kind,
  setKind,
  insights,
  spaceName,
  limitText,
}: {
  kind: RuleKind
  setKind: (k: RuleKind) => void
  insights: RuleInsights | undefined
  spaceName: (id: string) => string
  limitText: (v: number) => string
}) {
  const { t } = useTranslation()
  const [fromItem, setFromItem] = useState<{ kind: RuleKind; spaceId: string | null; limit: number | null } | null>(
    null,
  )
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const k = q.get("ruleKind")
    if (!isRuleKind(k)) return
    const limit = q.get("limit")
    setKind(k)
    // Read once: a reload, or a link copied from the address bar, does not offer the same rule again.
    const keep = new URLSearchParams(q)
    for (const p of ["ruleKind", "space", "limit"]) keep.delete(p)
    window.history.replaceState(null, "", `${window.location.pathname}${keep.size ? `?${keep}` : ""}`)
    // Only a link from an item offers a rule; a plain link to a kind just opens it.
    if (!q.get("space") && !limit) return
    setFromItem({
      kind: k,
      spaceId: q.get("space"),
      limit: limit != null && /^\d+$/.test(limit) ? Number(limit) : null,
    })
  }, [setKind])

  const offers = useMemo<OfferedRule[]>(() => {
    const where = (id: string | null) => (id ? spaceName(id) : t("approvals.rules.everywhere"))
    const out: OfferedRule[] = []
    if (fromItem && fromItem.kind === kind)
      out.push({
        key: "item",
        spaceId: fromItem.spaceId,
        limit: fromItem.limit,
        why:
          fromItem.limit != null
            ? t("approvals.tree.smart.fromItem", { where: where(fromItem.spaceId), limit: limitText(fromItem.limit) })
            : t("approvals.tree.smart.fromItemAny", { where: where(fromItem.spaceId) }),
      })
    for (const s of insights?.kind === kind ? insights.suggestions : [])
      out.push({
        key: `${s.spaceId ?? "all"}:${s.limit}`,
        spaceId: s.spaceId,
        limit: s.limit,
        why: t("approvals.tree.smart.suggest", { count: s.count, limit: limitText(s.limit), where: where(s.spaceId) }),
      })
    return out.filter((o) => !hidden.has(`${kind}:${o.key}`))
  }, [fromItem, insights, kind, hidden, spaceName, limitText, t])

  const dismiss = (o: OfferedRule) => {
    setHidden((h) => new Set(h).add(`${kind}:${o.key}`))
    if (o.key === "item") setFromItem(null)
  }
  return { offers, dismiss }
}
