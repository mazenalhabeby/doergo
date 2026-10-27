"use client"

import { useTranslation } from "react-i18next"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { FallThrough } from "../../_lib/rule-range"
import { DoneNode } from "./tree-nodes"

const NODE =
  "flex w-[260px] flex-col gap-0.5 rounded-2xl border border-dashed border-border bg-card px-3.5 py-2.5 text-left " +
  "shadow-shell outline-none transition-[border-color,transform] hover:-translate-y-px hover:border-shell-accent " +
  "focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-shell-accent"
const EVERY =
  "flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background " +
  "hover:opacity-90 disabled:opacity-50"
const ADD =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-shell-accent " +
  "hover:bg-shell-accent-soft disabled:opacity-50"

/**
 * What no rule catches, summed up instead of listed: how many workspaces get only the first approval
 * (and how many only up to a limit). Clicking it lists them, each with "add a rule here", plus one button
 * that covers every workspace at once.
 */
export function UncaughtNode({
  items,
  limitText,
  busy,
  onAdd,
}: {
  items: FallThrough[]
  limitText: (v: number) => string
  busy: boolean
  onAdd: (spaceId: string | null) => void
}) {
  const { t } = useTranslation()
  const none = items.filter((f) => f.upTo == null)
  const below = items.filter((f) => f.upTo != null)
  const headline = none.length
    ? t("approvals.tree.uncaught.none", { count: none.length })
    : t("approvals.tree.uncaught.below", { count: below.length })

  return (
    <div className="flex items-center gap-3">
      <Popover>
        <PopoverTrigger className={NODE}>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <Icon name="alertLine" size={14} />
            {t("approvals.tree.noRuleFits")}
          </span>
          <span className="text-[14.5px] font-semibold">{headline}</span>
          <span className="text-[12px] text-muted-foreground">
            {none.length > 0 && below.length > 0
              ? t("approvals.tree.uncaught.alsoBelow", { count: below.length })
              : t("approvals.tree.uncaught.see")}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-[340px] flex-col gap-2 rounded-2xl p-3 shadow-shell-pop">
          <button type="button" disabled={busy} onClick={() => onAdd(null)} className={EVERY}>
            <Icon name="plus" size={16} />
            {t("approvals.tree.uncaught.everyWorkspace")}
          </button>
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {items.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{f.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {f.upTo == null
                      ? t("approvals.tree.uncaught.noRule")
                      : t("approvals.tree.uncaught.upTo", { to: limitText(f.upTo) })}
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => onAdd(f.id)} className={ADD}>
                  <Icon name="plus" size={14} />
                  {t("approvals.tree.uncaught.addHere")}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <DoneNode>{t("approvals.tree.doneOne")}</DoneNode>
    </div>
  )
}
