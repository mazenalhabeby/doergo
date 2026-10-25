"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { MapPin } from "lucide-react"
import { isAdmin, parseClockInPick, type ClockInPick } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingCard } from "./setting-card"
import { useClockInLocations } from "./use-clock-in-pick-offered"
import { OptionCard, OptionRadio } from "@/components/ui/option-card"
import { ClockUseChoice } from "./clock-use-choice"

/**
 * Clock in where I stand, or always choose — the member's own setting
 * (`User.clockInPick`), read by the Clock in button here and on the phone through
 * the shared `chooseClockInLocation`. Saved as it is picked. Where they MAY clock
 * in is the server's either way.
 */
export function ClockInSection() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const { data: places, isLoading } = useClockInLocations()
  const [saving, setSaving] = useState<ClockInPick | null>(null)
  const current = parseClockInPick(user?.clockInPick)
  // An administrator may take themselves off the clock (A7); then where-to-clock-in has nothing to ask.
  const admin = !!user && isAdmin(user)
  const clockOff = user?.clockOff === true

  const choose = async (pick: ClockInPick) => {
    if (pick === current || saving) return
    setSaving(pick)
    try {
      await usersApi.updateMe({ clockInPick: pick })
      await refreshUser()
      notify.success(t("settings.clockIn.saved"))
    } catch (e) {
      notify.error(errorMessage(e, t("settings.clockIn.failed")))
    } finally {
      setSaving(null)
    }
  }

  const names = (places ?? []).map((p) => p.name)
  const options: { key: ClockInPick; title: string; hint: string }[] = [
    { key: "AUTO", title: t("settings.clockIn.autoTitle"), hint: t("settings.clockIn.autoHint") },
    { key: "ASK", title: t("settings.clockIn.askTitle"), hint: t("settings.clockIn.askHint") },
  ]

  return (
    <SettingCard
      icon={MapPin}
      iconColor="text-emerald-600"
      iconBg="bg-emerald-50 dark:bg-emerald-950/40"
      title={t("settings.clockIn.title")}
      description={
        isLoading
          ? undefined
          : names.length > 1
            ? t("settings.clockIn.workspaces", { n: names.length, names: names.join(", ") })
            : t("settings.clockIn.oneWorkspace")
      }
    >
      <div className="space-y-5">
        {admin && <ClockUseChoice />}
        {clockOff ? null : isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <div className={admin ? "space-y-3 border-t border-border pt-4" : "space-y-3"}>
            <p className="text-sm font-medium text-foreground">{t("settings.clockIn.question")}</p>
            <div role="radiogroup" aria-label={t("settings.clockIn.question")} className="grid gap-3 sm:grid-cols-2">
              {options.map((o) => {
                const on = current === o.key
                return (
                  <OptionCard
                    key={o.key}
                    role="radio"
                    aria-checked={on}
                    selected={on}
                    disabled={!!saving}
                    onClick={() => choose(o.key)}
                  >
                    <OptionRadio selected={on} />
                    <span className="space-y-1">
                      <span className="block text-sm font-semibold text-foreground">{o.title}</span>
                      <span className="block text-[13px] leading-snug text-muted-foreground">{o.hint}</span>
                    </span>
                  </OptionCard>
                )
              })}
            </div>
            <p className="text-[13px] text-muted-foreground">{t("settings.clockIn.footnote")}</p>
          </div>
        )}
      </div>
    </SettingCard>
  )
}
