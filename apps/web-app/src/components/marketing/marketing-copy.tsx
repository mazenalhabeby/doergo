"use client"

import { useEffect, useState, type ReactNode } from "react"
import { registerMarketingCopy, wantMarketing } from "@/i18n"
import { SiteFont } from "./site-font"

/**
 * The public site's text for one page. Its server page reads the groups it renders (`home`,
 * `pricing`, `privacy`, `terms`) in English and hands them here; they are registered BEFORE the
 * page renders, on the server and in the browser alike, so the prerendered HTML and the first
 * client render agree. Another language arrives from `i18n` once the page is on screen.
 *
 * ⚠️ The groups arrive as a PROP from a server component. A `'use client'` file importing the
 * marketing JSON would put it in every bundle — the reason it was split out of the app's catalogue.
 */
export function MarketingCopy({ en, children }: { en: Record<string, unknown>; children: ReactNode }) {
  useState(() => registerMarketingCopy("en", en))
  useEffect(() => wantMarketing(), [])
  return <SiteFont>{children}</SiteFont>
}
