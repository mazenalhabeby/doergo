"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { OptionCard, OptionRadio } from "@/components/ui/option-card"

/**
 * An administrator's own clock, on or off (clock review A7, `User.clockOff`). Everyone else's clock is
 * their access profile's, set by the office — so this renders only for an admin, and the server refuses
 * it for anyone else. Off: no Clock in button, tab or reminders; their decisions about others' hours stay.
 */
export function ClockUseChoice() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const usesClock = user?.clockOff !== true

  const choose = async (next: boolean) => {
    if (next === usesClock || saving) return
    setSaving(true)
    try {
      await usersApi.updateMe({ usesClock: next })
      await refreshUser()
      notify.success(t("settings.clockIn.usesSaved"))
    } catch (e) {
      notify.error(errorMessage(e, t("settings.clockIn.usesOpenShift")))
    } finally {
      setSaving(false)
    }
  }

  const options = [
    { on: true, title: t("settings.clockIn.usesOnTitle"), hint: t("settings.clockIn.usesOnHint") },
    { on: false, title: t("settings.clockIn.usesOffTitle"), hint: t("settings.clockIn.usesOffHint") },
  ]
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{t("settings.clockIn.usesQuestion")}</p>
      <div role="radiogroup" aria-label={t("settings.clockIn.usesQuestion")} className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const selected = usesClock === o.on
          return (
            <OptionCard
              key={String(o.on)}
              role="radio"
              aria-checked={selected}
              selected={selected}
              disabled={saving}
              onClick={() => choose(o.on)}
            >
              <OptionRadio selected={selected} />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">{o.title}</span>
                <span className="block text-[13px] leading-snug text-muted-foreground">{o.hint}</span>
              </span>
            </OptionCard>
          )
        })}
      </div>
    </div>
  )
}
