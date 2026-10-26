"use client"

import type { IconName } from "@hbcfield/shared/client"
import { Icon } from "./icon"

/**
 * Chat's marks: the shared icon in the jade ink — or flat in the current text colour (`flat`), for an icon on a
 * coloured surface such as the active Send button. A name kept for its callers; the drawing is `Icon`'s.
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
  label?: string
}) {
  return <Icon name={name} size={size} ink={!flat} className={className} label={label} />
}
