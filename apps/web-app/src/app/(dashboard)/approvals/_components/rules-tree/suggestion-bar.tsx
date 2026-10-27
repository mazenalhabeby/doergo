"use client"

import { useTranslation } from "react-i18next"
import type { RuleInsights } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/** A rule the page offers: from the last 90 days, or from an item the office opened "make a rule like this" on. */
export interface OfferedRule {
  key: string
  spaceId: string | null
  limit: number | null
  /** Why it is offered, in words. */
  why: string
}

const CARD =
  "flex min-w-[260px] flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-shell " +
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"

/**
 * The page's own reading of the last 90 days, in one line, and the rules worth adding — each one tap away.
 * Counts only: nothing here changes a rule until "Add" is pressed.
 */
export function SuggestionBar({
  insights,
  kindLabel,
  offers,
  busy,
  approver,
  onAdd,
  onDismiss,
}: {
  insights: RuleInsights | undefined
  kindLabel: string
  offers: OfferedRule[]
  busy: boolean
  /** Who a rule added from here asks (changed on the canvas after). */
  approver?: string
  onAdd: (o: OfferedRule) => void
  onDismiss: (o: OfferedRule) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2.5">
      {insights && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <Icon name="sparkles" size={15} className="text-shell-accent" />
          <span>
            {t("approvals.tree.smart.window", { count: insights.total, kind: kindLabel, days: insights.days })}
          </span>
          <span className="font-semibold text-foreground">
            {t("approvals.tree.smart.caught", { count: insights.total - insights.uncovered })}
          </span>
          <span>{t("approvals.tree.smart.alone", { count: insights.uncovered })}</span>
        </p>
      )}
      {offers.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {offers.map((o) => (
            <div key={o.key} className={CARD}>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-shell-accent-soft text-shell-accent"
              >
                <Icon name="sparkles" size={17} />
              </span>
              <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
                {o.why}
                {approver && (
                  <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                    {t("approvals.tree.smart.approver", { role: approver })}
                  </span>
                )}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAdd(o)}
                className={cn(
                  "h-9 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background",
                  "hover:opacity-90 disabled:opacity-50",
                )}
              >
                {t("approvals.tree.smart.add")}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(o)}
                aria-label={t("approvals.tree.smart.notNow")}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <Icon name="closeLine" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
