import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

/*
  THE option card (docs/design/ui-pieces/variants.md §3): a bordered row you
  pick, `border-primary bg-primary/5` when chosen, with one radio dot. `sm` for
  a list of people or places, `md` for a setting with a title and a hint.
*/
const FRAME = "border transition-colors"
const STATE = (selected: boolean) => (selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")

export function OptionCard({
  selected,
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        FRAME,
        "flex w-full items-start gap-3 text-left disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "rounded-lg px-3 py-2.5" : "rounded-xl p-4",
        STATE(selected),
        className,
      )}
    />
  )
}

/** The same frame around a choice that opens more fields under it (a button inside, extras below). */
export function OptionFrame({
  selected,
  className,
  children,
}: {
  selected: boolean
  className?: string
  children: ReactNode
}) {
  return <div className={cn(FRAME, "rounded-xl", STATE(selected), className)}>{children}</div>
}

/** The radio dot of an option card. */
export function OptionRadio({ selected, className }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  )
}
