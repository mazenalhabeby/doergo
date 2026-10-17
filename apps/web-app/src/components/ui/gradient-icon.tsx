"use client"

import { useId } from "react"
import { ICON_VIEWBOX, INK_GRADIENT, iconMarkup, type IconName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

const STOPS = INK_GRADIENT.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")

/**
 * One of the product's icons (shared `SOLAR_ICONS`, the same set the phone
 * draws), painted in the "gradient ink" — or flat in the current text colour
 * (`flat`), for an icon on a coloured surface such as the active Send button.
 *
 * `data-i` carries the icon's name: its own hover motion (the bell swings, the
 * plane flies) is keyed on it in globals.css, under `.icon-motion` parents.
 */
export function GradientIcon({
  name,
  size = 20,
  flat = false,
  className,
  label,
}: {
  name: IconName
  size?: number
  flat?: boolean
  className?: string
  /** Spoken name; without it the icon is decoration and hidden from screen readers. */
  label?: string
}) {
  // A gradient is referenced by id, so each icon needs its own (two icons on a page must not share one).
  const id = `ink${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const html = flat
    ? iconMarkup(name)
    : `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${STOPS}</linearGradient></defs>${iconMarkup(name, `url(#${id})`)}`
  return (
    <svg
      viewBox={ICON_VIEWBOX}
      width={size}
      height={size}
      data-i={name}
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
