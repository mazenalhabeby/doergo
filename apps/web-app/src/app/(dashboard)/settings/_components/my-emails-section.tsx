"use client"

import { keys } from "@/lib/query-keys"
import { MEMBER_EMAIL_PREF, type MemberEmail } from "@hbcfield/shared/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Mail } from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { SettingCard } from "./setting-card"
import { usersApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleRow } from "./settings-form-bits"

/**
 * The emails HBCField sends ME — one switch each, saved as it is flipped.
 *
 * Personal, and open to every member: these are the member's own opt-outs,
 * stored on their account. The organization's switch above them is a ceiling
 * the member cannot lift, so an email the organization has turned off shows
 * here off and disabled, with the reason — a switch that can be flipped and
 * does nothing is worse than no switch.
 */
export function MyEmailNotificationsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: keys.me.notificationPrefs(),
    queryFn: () => usersApi.getMyNotificationPrefs(),
  })

  const mutation = useMutation({
    mutationFn: (change: Record<string, boolean>) => usersApi.updateMyNotificationPrefs(change),
    onSuccess: (prefs) => {
      queryClient.setQueryData(keys.me.notificationPrefs(), (old: typeof data) => (old ? { ...old, prefs } : old))
      notify.success(t("settings.myEmails.saved"))
    },
    onError: (e: Error) => notify.error(e.message || t("settings.myEmails.failed")),
  })

  if (isLoading) return <Skeleton className="h-[260px] w-full rounded-2xl" />

  const ROWS: Array<{ kind: MemberEmail; label: string; description: string }> = [
    { kind: "taskAssigned", label: t("settings.myEmails.taskAssigned"), description: t("settings.myEmails.taskAssignedHint") },
    { kind: "taskCompleted", label: t("settings.myEmails.taskCompleted"), description: t("settings.myEmails.taskCompletedHint") },
    { kind: "autoClockOut", label: t("settings.myEmails.autoClockOut"), description: t("settings.myEmails.autoClockOutHint") },
  ]

  return (
    <SettingCard
      icon={Mail}
      iconColor="text-amber-600"
      iconBg="bg-amber-50"
      title={t("settings.myEmails.title")}
      description={t("settings.myEmails.description")}
    >
      <div className="divide-y divide-border">
        {ROWS.map(({ kind, label, description }) => {
          const allowed = data?.organizationAllows?.[kind] !== false
          const key = MEMBER_EMAIL_PREF[kind]
          const mine = data?.prefs?.[key] !== false
          return (
            <ToggleRow
              key={kind}
              id={`my-email-${kind}`}
              label={label}
              description={allowed ? description : t("settings.myEmails.offByOrg")}
              checked={allowed && mine}
              disabled={!allowed || mutation.isPending}
              onChange={(v) => mutation.mutate({ [key]: v })}
            />
          )
        })}
      </div>
    </SettingCard>
  )
}
