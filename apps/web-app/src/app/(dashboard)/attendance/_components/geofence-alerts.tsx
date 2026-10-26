import { useTranslation } from "react-i18next"
import { Chip } from "@/components/page/page-kit"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { useTimeFormat } from "@/hooks"
import { AlertCircle, MapPin } from "lucide-react"
import { personName, countryFromTz } from "@hbcfield/shared/client"
import { formatTime, formatDateInZone, StatusBadge } from "../../../../components/attendance/attendance-helpers"

/** Shifts clocked in or out outside the workspace's ring — the first five, and how many more. */
export function GeofenceAlerts({ violations }: { violations: TimeEntry[] }) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  if (violations.length === 0) return null
  return (
    <div className="bg-card rounded-[22px] border border-border shadow-shell mb-8 overflow-hidden">
      <div className="p-5 border-b border-transparent bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-shell-warn">
              {t("attendance.tracking.geofenceAlerts", { count: violations.length })}
            </h2>
            <p className="text-sm text-shell-warn">{t("attendance.tracking.geofenceAlertsDesc")}</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-amber-100">
        {violations.slice(0, 5).map((entry: TimeEntry) => (
          <div
            key={entry.id}
            className="p-4 flex items-center justify-between hover:bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)]"
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                firstName={entry.user?.firstName}
                lastName={entry.user?.lastName}

                seed={entry.user?.id}
                size="md"
                soft
              />
              <div>
                <p className="font-medium text-foreground">{personName(entry.user)}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.location?.name || t("attendance.unknownLocation")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {(() => {
                const tz = entry.timezone ?? entry.location?.timezone
                const country = countryFromTz(tz, locale)
                return (
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {formatTime(entry.clockInAt, hour12, locale, tz)}
                      {entry.clockOutAt && ` – ${formatTime(entry.clockOutAt, hour12, locale, tz)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateInZone(entry.clockInAt, tz, locale)}
                      {country ? ` · ${country}` : ""}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 justify-end">
                      {!entry.clockInWithinGeofence && (
                        <Chip tone="warn" className="h-5 gap-1 px-2 text-[11px]">
                          <MapPin className="size-3" />
                          {t("attendance.tracking.clockInOutside")}
                        </Chip>
                      )}
                      {entry.clockOutAt && entry.clockOutWithinGeofence === false && (
                        <Chip tone="warn" className="h-5 gap-1 px-2 text-[11px]">
                          <MapPin className="size-3" />
                          {t("attendance.tracking.clockOutOutside")}
                        </Chip>
                      )}
                    </div>
                  </div>
                )
              })()}
              <StatusBadge status={entry.status} />
            </div>
          </div>
        ))}
        {violations.length > 5 && (
          <div className="p-3 text-center text-sm text-shell-warn">
            {t("attendance.tracking.moreAlerts", { count: violations.length - 5 })}
          </div>
        )}
      </div>
    </div>
  )
}
