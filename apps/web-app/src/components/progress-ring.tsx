"use client"

import { cn } from "@/lib/utils"

/**
 * A number inside a ring that fills as it is used up.
 *
 * Lifted out of the time-off page, where it shows the holiday allowance. It is
 * the app's way of drawing "this much of that", and the shifts page needs the
 * same sentence about a working day — so the shape moves here rather than being
 * drawn twice with two sets of magic numbers.
 *
 * Presentational and unitless: the caller decides what the two numbers mean and
 * what the small print under them says.
 */
export function ProgressRing({
  value,
  total,
  label,
  caption,
  size = 68,
  loading,
  tone = "primary",
  className,
}: {
  value: number
  total: number
  /** The big number. Defaults to `value` — pass a string to format it. */
  label?: string
  /** The small line beneath it, e.g. "/ 25" or "of 8h". */
  caption?: string
  size?: number
  loading?: boolean
  /** `low` warns in amber once the ring is nearly empty — the allowance case. */
  tone?: "primary" | "low"
  className?: string
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0
  const r = 26
  const circumference = 2 * Math.PI * r
  // Amber below a quarter, but only where the caller asked for that meaning:
  // a shift that is nearly over is good news, an allowance that is nearly gone
  // is not, and the ring must not editorialise on its own.
  const warn = tone === "low" && pct <= 0.25

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            warn ? "stroke-amber-500" : "stroke-primary",
          )}
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : circumference * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none tabular-nums text-foreground">
          {loading ? "—" : (label ?? value)}
        </span>
        {!!caption && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{caption}</span>
        )}
      </div>
    </div>
  )
}
