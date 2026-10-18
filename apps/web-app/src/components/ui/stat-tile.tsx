import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { toneText, toneWell, type Tone } from "@/lib/status-tones"

/*
  THE stat tile (docs/design/ui-pieces/variants.md §2): label above, value below,
  an optional icon in a tinted well, the tone colouring the value. `sm` for a
  dense row of small figures, `md` (default) for a page's headline numbers.
*/
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  iconTone,
  delta,
  onClick,
  active = false,
  size = "md",
  className,
}: {
  label: ReactNode
  value: ReactNode
  icon?: LucideIcon
  /** Colours the value (neutral = the normal text colour). */
  tone?: Tone
  /** Colours the icon well; defaults to `tone`, or primary when the value is neutral. */
  iconTone?: Tone
  /** A small line under the value ("+6 on last month"). */
  delta?: ReactNode
  /** Makes the tile a button (a filter). */
  onClick?: () => void
  /** A clickable tile that is the current filter. */
  active?: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const body = (
    <>
      {Icon && (
        <span
          className={cn(
            "grid place-items-center rounded-lg",
            size === "sm" ? "mb-2 size-7" : "mb-3 size-8",
            toneWell(iconTone ?? (tone === "neutral" ? "primary" : tone)),
          )}
        >
          <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
        </span>
      )}
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          "block font-semibold tabular-nums",
          size === "sm" ? "text-lg" : "mt-0.5 text-2xl",
          toneText(tone),
        )}
      >
        {value}
      </span>
      {delta != null && <span className="mt-1 block text-xs text-muted-foreground">{delta}</span>}
    </>
  )
  const frame = cn(
    "rounded-xl border border-border bg-card text-left",
    size === "sm" ? "p-3" : "p-4",
    onClick &&
      "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active && "border-primary ring-1 ring-primary/30",
    className,
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={frame}>
        {body}
      </button>
    )
  }
  return <div className={frame}>{body}</div>
}
