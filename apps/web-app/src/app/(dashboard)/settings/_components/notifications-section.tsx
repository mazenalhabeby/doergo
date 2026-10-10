"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { ORG_EMAIL_SWITCH } from "@hbcfield/shared/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { SettingCard } from "./setting-card"
import { organizationsApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleRow, SaveBar } from "./settings-form-bits"

export function NotificationsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  /*
    The three member emails default to ON, as the sender reads them: an
    organization that never saved this section has no keys, and the switches
    must show what actually happens rather than a default the server does not
    share. The keys come from shared, where the sender reads them too.
  */
  const [prefs, setPrefs] = useState({
    [ORG_EMAIL_SWITCH.taskAssigned]: true,
    [ORG_EMAIL_SWITCH.taskCompleted]: true,
    [ORG_EMAIL_SWITCH.autoClockOut]: true,
    emailOnJoinRequest: true,
    pushEnabled: true,
  } as Record<string, boolean>)
  const [initialized, setInitialized] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: keys.organization.profile(),
    queryFn: () => organizationsApi.getProfile(),
  })

  useEffect(() => {
    if (profile && !initialized) {
      const saved = (profile.notificationPrefs ?? {}) as Record<string, boolean>
      setPrefs((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, saved[k] !== false])))
      setInitialized(true)
    }
  }, [profile, initialized])

  const mutation = useMutation({
    mutationFn: (d: typeof prefs) => organizationsApi.updateNotificationPrefs(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
      notify.success(t("settings.notifications.saved"))
    },
    onError: (e: Error) => notify.error(e.message || t("settings.notifications.failed")),
  })

  if (isLoading) return <Skeleton className="h-[300px] w-full rounded-2xl" />

  // "Email on task creation" used to lead this list. No such email exists, so
  // the switch did nothing; the email that does exist — assignment — replaces it.
  const TOGGLES = [
    {
      key: ORG_EMAIL_SWITCH.taskAssigned,
      label: t("settings.notifications.emailOnTaskAssigned"),
      description: t("settings.notifications.emailOnTaskAssignedHint"),
    },
    {
      key: ORG_EMAIL_SWITCH.taskCompleted,
      label: t("settings.notifications.emailOnTaskComplete"),
      description: t("settings.notifications.emailOnTaskCompleteHint"),
    },
    {
      key: ORG_EMAIL_SWITCH.autoClockOut,
      label: t("settings.notifications.emailOnAutoClockOut"),
      description: t("settings.notifications.emailOnAutoClockOutHint"),
    },
    { key: "emailOnJoinRequest", label: t("settings.notifications.emailOnJoinRequest"), description: undefined },
    { key: "pushEnabled", label: t("settings.notifications.pushEnabled"), description: undefined },
  ]

  return (
    <SettingCard
      icon={Bell}
      iconColor="text-amber-600"
      iconBg="bg-amber-50"
      title={t("settings.notifications.title")}
      description={t("settings.notifications.description")}
    >
      <div className="divide-y divide-border">
        {TOGGLES.map(item => (
          <ToggleRow
            key={item.key}
            id={`notif-${item.key}`}
            label={item.label}
            description={item.description}
            checked={prefs[item.key] ?? true}
            onChange={v => setPrefs(prev => ({ ...prev, [item.key]: v }))}
          />
        ))}
      </div>
      <SaveBar onSave={() => mutation.mutate(prefs)} isPending={mutation.isPending} t={t} />
    </SettingCard>
  )
}
