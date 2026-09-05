"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A value that is cut off, and can show the whole of itself.
 *
 * "maintenance@omv.exam…" has no way to finish itself: there is no expand, and
 * the panel it sits in is exactly where somebody goes to FIND an address.
 *
 * ⚠️ The tooltip appears ONLY when the text is genuinely clipped, measured
 * rather than guessed. A hover box on a value that already fits is a tooltip
 * that repeats what the reader is looking at — and whether a value fits depends
 * on the window, the language and the length, so it cannot be decided when the
 * component is written. It is measured on mount and again whenever the element
 * resizes.
 *
 * The native `title` attribute did the job first and was replaced because it
 * waits about a second, cannot be styled, and truncates long values itself in
 * some browsers.
 */
export function Truncated({
  text,
  href,
  className,
  side = "left",
}: {
  text: string
  /** Renders an anchor instead of a span — for mailto:/tel:/website values. */
  href?: string
  className?: string
  side?: "top" | "right" | "bottom" | "left"
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [clipped, setClipped] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // +1 absorbs sub-pixel rounding: at some widths a value that fits exactly
    // reports one hundredth of a pixel of overflow and would flicker a tooltip.
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const shared = {
    ref: ref as React.Ref<never>,
    className: cn("block truncate", className),
    children: text,
  }
  const node = href ? <a href={href} {...shared} /> : <span {...shared} />

  if (!clipped) return node

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        {/*
          Neutral rather than the filled default.

          This box exists to show DATA — an address, a registration number — and
          a long value on a solid accent reads as a notification rather than the
          thing it is. Same tokens as every other surface in the product, so it
          belongs to the page it is floating over.

          `break-all` because the values that overflow are the ones with no
          spaces to break on, which is why they overflowed.
        */}
        <TooltipContent
          side={side}
          className="max-w-xs break-all border border-border bg-popover text-popover-foreground shadow-md"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
