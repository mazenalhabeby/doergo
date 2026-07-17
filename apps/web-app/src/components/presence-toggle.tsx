"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"

export type Presence = "AVAILABLE" | "BUSY" | "AWAY"

/**
 * Availability options — the ONLY three self-set states. Everyone defaults to
 * Available on login. `dot` colors the menu bullet; `ring` colors the ring drawn
 * around the user's own avatar in the header (status lives on the avatar, not a
 * separate pill — Slack/Teams pattern).
 */
export const PRESENCE_OPTS: {
  value: Presence
  key: string
  def: string
  dot: string
  ring: string
}[] = [
  { value: "AVAILABLE", key: "presence.available", def: "Available", dot: "bg-green-500", ring: "ring-green-500" },
  { value: "BUSY", key: "presence.busy", def: "Busy", dot: "bg-red-500", ring: "ring-red-500" },
  { value: "AWAY", key: "presence.away", def: "Away", dot: "bg-amber-500", ring: "ring-amber-500" },
]

/** Ring class for a presence value (used on the header avatar). */
export function presenceRingClass(presence: Presence | string | null | undefined): string {
  return PRESENCE_OPTS.find((o) => o.value === presence)?.ring ?? "ring-green-500"
}

/**
 * Self availability controller. Reads the current value from the auth user and
 * exposes a setter that persists it (and refreshes the user). No "auto" state —
 * a missing value simply reads as Available (the login default).
 */
export function usePresence() {
  const { user, refreshUser, patchUser } = useAuth()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  const current = ((user?.presence as Presence) ?? "AVAILABLE") as Presence

  const set = async (presence: Presence) => {
    if (presence === current) return
    const previous = current
    // Optimistic: flip the ring/label instantly, revert if the save fails.
    patchUser({ presence })
    setSaving(true)
    try {
      await usersApi.updateMe({ presence })
      await refreshUser()
    } catch (e) {
      patchUser({ presence: previous })
      toast.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
    } finally {
      setSaving(false)
    }
  }

  return { current, set, saving }
}
