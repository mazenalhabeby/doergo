"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const MOTION = "duration-[320ms] ease-[cubic-bezier(.32,.72,0,1)]"

/**
 * Two panes side by side in one box: going to the second slides the first out to the left while the second
 * slides in; back reverses it. Both panes share the TALLER one's height, so the box never resizes — a popover
 * anchored to a button does not wobble while it slides (measured: animating the height moved the anchored
 * edge 16px). The hidden pane is `inert` — no tab stops, nothing read aloud. Reduced motion: no slide.
 */
export function SlidePanels({ index, children }: { index: 0 | 1; children: [ReactNode, ReactNode] }) {
  const pane = (i: 0 | 1) =>
    cn(
      "flex w-1/2 shrink-0 flex-col transition-opacity",
      MOTION,
      i === index ? "opacity-100" : "pointer-events-none opacity-0",
    )
  return (
    <div className="shell-motion overflow-hidden">
      <div
        className={cn("flex w-[200%] items-stretch transition-transform will-change-transform", MOTION)}
        style={{ transform: `translateX(${index === 0 ? 0 : -50}%)` }}
      >
        <div className={pane(0)} inert={index !== 0 || undefined}>
          {children[0]}
        </div>
        <div className={pane(1)} inert={index !== 1 || undefined}>
          {children[1]}
        </div>
      </div>
    </div>
  )
}
