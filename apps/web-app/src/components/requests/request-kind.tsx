"use client"

import { useTranslation } from "react-i18next"
import { Hourglass, House, MessageSquareText, Palmtree, Clock3, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { requestKindHintKey, requestKindLabelKey, requestKindOf, type RequestKind } from "@/lib/requests"

/**
 * A request kind, drawn — the ONE icon and name per kind for the member's form,
 * their history, a member's record and the manager's drawer and chart.
 *
 * Icons are single-colour lucide glyphs (no multi-colour icons in this app):
 * colour on these screens means STATE — pending, approved, cover — so a kind is
 * told apart by its shape and its name, never by a hue of its own.
 */
export const REQUEST_KIND_ICON: Record<RequestKind, LucideIcon> = {
  LEAVE: Palmtree,
  REMOTE: House,
  HOURS: Clock3,
  OVERTIME: Hourglass,
  OTHER: MessageSquareText,
}

/** A small, calm chip: icon + the kind's name. */
export function RequestKindChip({ kind, className }: { kind: string | null | undefined; className?: string }) {
  const { t } = useTranslation()
  const k = requestKindOf(kind)
  const Icon = REQUEST_KIND_ICON[k]
  return (
    <span
      className={cn(
        ("inline-flex items-center gap-1 rounded-full border border-border " +
          "bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"),
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(requestKindLabelKey(k))}
    </span>
  )
}

/**
 * Choose what you are asking for — first, before anything else on the form.
 *
 * Only the kinds the server offers are shown (the workspace's list, and REMOTE
 * only for somebody allowed to work away from a site). With one kind there is
 * nothing to choose, so nothing is drawn.
 */
export function RequestKindPicker({
  kinds,
  value,
  onChange,
}: {
  kinds: readonly RequestKind[]
  value: RequestKind
  onChange: (k: RequestKind) => void
}) {
  const { t } = useTranslation()
  if (kinds.length < 2) return null
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t("requests.form.kindQuestion")}
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
        {kinds.map((k) => {
          const Icon = REQUEST_KIND_ICON[k]
          const active = value === k
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(k)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{t(requestKindLabelKey(k))}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{t(requestKindHintKey(value))}</p>
    </div>
  )
}
