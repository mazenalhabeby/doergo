import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

/** The round icon button of the top bar's inbox group — Approvals, Messages, Notifications, Help, Support. */
export const topBarIcon =
  "relative grid size-[38px] shrink-0 place-items-center rounded-full text-shell-soft transition-colors " +
  "hover:bg-shell-hover hover:text-shell-ink focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-shell-accent [&_svg]:size-[18px]"

export const topBarIconOn = "bg-shell-nav-on text-shell-nav-on-ink"

/** The count on an icon: warn (decisions), accent (unread), crit (cannot wait). */
export function CountDot({ n, tone }: { n: number; tone: "warn" | "accent" | "crit" }) {
  if (n <= 0) return null
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-0.5 top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2",
        "border-shell-card px-1 text-[10px] font-bold tabular-nums leading-none",
        tone === "warn" && "bg-shell-warn text-shell-on-warn",
        tone === "accent" && "bg-shell-accent text-shell-on-accent",
        tone === "crit" && "bg-shell-crit text-white",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  )
}

export const TopBarButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & { on?: boolean }>(
  function TopBarButton({ className, on, ...props }, ref) {
    return <button ref={ref} type="button" className={cn(topBarIcon, on && topBarIconOn, className)} {...props} />
  },
)
