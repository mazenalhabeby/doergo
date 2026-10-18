import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { toneChip, type Tone } from "@/lib/status-tones"

/** A status pill in one of the six tones. The screen decides the tone; this decides the colour. */
export function ToneChip({
  tone,
  children,
  dot = false,
  className,
}: {
  tone: Tone
  children: ReactNode
  /** A small dot before the text (phone sync, presence). */
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        toneChip(tone),
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
