"use client"

import { cn } from "@/lib/utils"

// Leaf skeleton pieces with no dependencies of their own. They live apart from
// dashboard-skeleton.tsx so RouteSkeleton can use the generic content shape
// without the two files importing each other in a cycle.

/**
 * The one shimmering placeholder.
 *
 * Every skeleton in the app draws from this: the page skeletons, the dashboard,
 * and the task views. Four separate copies of the same 200-character class
 * string existed before — one per skeleton file plus ~20 pasted inline into the
 * tasks page — so a change to the sheen meant finding all of them.
 *
 * `delayMs` offsets the sweep per element, via a custom property because the
 * sweep runs on the ::after pseudo-element, which inline styles cannot reach.
 */
export function Shimmer({
  className,
  style,
  delayMs = 0,
}: {
  className?: string
  style?: React.CSSProperties
  delayMs?: number
}) {
  return (
    <div
      className={cn("skeleton-bone rounded-md", className)}
      style={{ ...style, "--shimmer-delay": `${delayMs}ms` } as React.CSSProperties}
    />
  )
}
