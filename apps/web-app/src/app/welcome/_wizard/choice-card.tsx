"use client"

import { cn } from "@/lib/utils"
import { WizardIcon } from "./wizard-icons"

/**
 * One tappable choice — icon tile + label (+ optional hint). Presentational and
 * reused by every question step. Uses design-system semantic tokens only.
 */
export function ChoiceCard({
  icon,
  label,
  hint,
  selected = false,
  recommended = false,
  badge,
  onClick,
  as = "button",
}: {
  icon: string
  label: string
  hint?: string
  selected?: boolean
  recommended?: boolean
  badge?: string
  onClick?: () => void
  /** "static" renders a non-interactive card (e.g. a read-only summary chip). */
  as?: "button" | "static"
}) {
  const Comp: React.ElementType = as === "button" ? "button" : "div"
  return (
    <Comp
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-xl border-[1.5px] p-4 text-left transition-all duration-150",
        as === "button" && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        selected
          ? "border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]"
          : recommended
            ? "border-green-300 bg-gradient-to-b from-green-50 to-card dark:border-green-800/60 dark:from-green-950/30"
            : "border-border bg-card",
      )}
    >
      {badge && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-green-600 px-3 py-[3px] text-[10.5px] font-extrabold uppercase tracking-wide text-white shadow-sm">
          {badge}
        </span>
      )}
      {selected && (
        <span className="absolute right-3 top-3 grid size-[22px] place-items-center rounded-full bg-primary text-primary-foreground">
          <WizardIcon name="check" className="size-3.5" />
        </span>
      )}
      <span
        className={cn(
          "grid size-[42px] place-items-center rounded-[11px]",
          recommended
            ? "bg-green-100 text-green-700 dark:bg-green-900/40"
            : "bg-primary/5 text-primary group-[.selected]:bg-card",
          selected && "bg-card",
        )}
      >
        <WizardIcon name={icon} className="size-[21px]" />
      </span>
      <span className="text-[14.5px] font-bold leading-tight tracking-tight text-foreground">{label}</span>
      {hint && <span className="-mt-1 text-[12.5px] leading-snug text-muted-foreground">{hint}</span>}
    </Comp>
  )
}
