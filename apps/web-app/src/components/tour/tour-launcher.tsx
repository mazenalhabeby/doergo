"use client"

import { useTour } from "./tour-context"

/**
 * Which tour "A quick tour of this page" starts — the CURRENT page's if it has one, otherwise the first tour
 * this member may take (start() navigates to it). Undefined when there is none: the menu row is not shown.
 */
export function useTourTarget(): string | undefined {
  const { availableTours, contextualTourId } = useTour()
  return contextualTourId ?? availableTours[0]?.id
}
