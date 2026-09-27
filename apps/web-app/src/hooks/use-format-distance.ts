"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { formatDistance, type DistanceFormatOptions } from "@hbcfield/shared/client"

/**
 * The shared distance formatter, bound to the language on screen.
 *
 * ⚠️ Not a copy: the rules ("850 m", "1.2 km", "9,631 km") live once in
 * `packages/shared/src/utils/distance.ts`. This only supplies the locale, so a
 * German reader sees "1,2 km". `apps/mobile/src/lib/__tests__/distance-display-guard.spec.ts` fails if a screen
 * builds "km" by hand again.
 */
export function useFormatDistance() {
  const { i18n } = useTranslation()
  const locale = i18n.language
  return useCallback(
    (metres: number | null | undefined, options: DistanceFormatOptions = {}) => formatDistance(metres, { locale, ...options }),
    [locale],
  )
}
