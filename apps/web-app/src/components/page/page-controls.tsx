"use client"

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/*
  The tool row of a page (docs/design/web-redesign boards): the round search box and the filter pills, drawn ONCE.
  The width is the page's choice (`className` on the box); everything else is the board's.
*/

type SearchPillProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "className"> & {
  /** The box's width and placement (`sm:w-[280px]`, `ml-auto`). */
  className?: string
  /** The guided tour's anchor on the box. */
  tour?: string
}

/** The round search box: a line icon and the input, ringed on focus. The placeholder is its label too. */
export const SearchPill = forwardRef<HTMLInputElement, SearchPillProps>(function SearchPill(
  { className, tour, placeholder, "aria-label": ariaLabel, ...input },
  ref,
) {
  return (
    <label
      data-tour={tour}
      className={cn(
        "flex h-[38px] w-full items-center gap-2 rounded-full border border-border bg-card px-3 text-muted-foreground",
        "focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <Icon name="searchLine" size={16} />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        {...input}
      />
    </label>
  )
})

/** One filter of a row of pills: ink when it is the one shown. `dot` is a Tailwind background for a state dot. */
export function FilterPill({
  active,
  onClick,
  dot,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  dot?: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px]",
        "font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-[7px] rounded-full", dot)} />}
      {children}
    </button>
  )
}

/** The row the pills sit in: wraps on a narrow screen; `label` names the group for a screen reader. */
export function FilterPills({
  label,
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {children}
    </div>
  )
}
