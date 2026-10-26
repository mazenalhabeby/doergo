"use client"

import { useId } from "react"
import { ICON_VIEWBOX, iconMarkup, type IconName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

/**
 * THE icon (web) — one mark from the shared library (`SOLAR_ICONS`, the set the phone draws too), in the text
 * colour around it. `ink` paints it with the jade ink instead (chat's marks): two stops from CSS
 * (--icon-ink-from/--icon-ink-to in globals.css, light and dark), so it follows the theme.
 *
 * The markup is the library's own constant — never anything a person typed — and the library's spec pins it to
 * drawing elements only, which is what makes `dangerouslySetInnerHTML` safe here.
 *
 * `data-i` carries the name: an icon's own hover motion (the bell swings) is keyed on it in globals.css.
 */
export function Icon({
  name,
  size = 20,
  ink = false,
  className,
  label,
}: {
  name: IconName
  size?: number
  ink?: boolean
  className?: string
  /** Spoken name; without it the icon is decoration and hidden from screen readers. */
  label?: string
}) {
  // A gradient is referenced by id, so each inked icon needs its own (two on a page must not share one).
  const id = `ink${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const html = ink
    ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" style="stop-color:var(--icon-ink-from)"/><stop offset="1" style="stop-color:var(--icon-ink-to)"/>` +
      `</linearGradient></defs>${iconMarkup(name, `url(#${id})`)}`
    : iconMarkup(name)
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
