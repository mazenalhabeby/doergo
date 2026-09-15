"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { isSupported } from "@/i18n/languages"

/** `<userId>:<language>` last told to the server from this browser. */
const SYNCED_KEY = "hbcfield_locale_synced"

/**
 * Tell the server which language this member reads.
 *
 * The bell's titles are written on the server when the event happens, in the
 * reader's language — and on the web that language lives in localStorage, often
 * chosen on the marketing page before anybody signed in. So the choice is sent
 * whenever it differs from what this browser last sent for this member: once
 * after the first sign-in, and again each time the switcher changes it.
 *
 * Mounted in the dashboard only, never on a marketing page: there is nobody to
 * tell there, and `@/lib/api` has no business in the public bundle.
 */
export function useSyncLocale() {
  const { user } = useAuth()
  const { i18n } = useTranslation()
  const language = i18n.language?.split("-")[0]

  useEffect(() => {
    if (!user?.id || !language || !isSupported(language)) return
    const marker = `${user.id}:${language}`
    let last: string | null = null
    try {
      last = localStorage.getItem(SYNCED_KEY)
    } catch {
      // Storage blocked: sending once per page load is still correct, just chattier.
    }
    if (last === marker) return

    let cancelled = false
    usersApi
      .updateMe({ locale: language })
      .then(() => {
        if (cancelled) return
        try {
          localStorage.setItem(SYNCED_KEY, marker)
        } catch {
          /* see above */
        }
      })
      // A failure leaves the marker unset, so the next page load tries again.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.id, language])
}
