import { useTranslation } from "react-i18next"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { useTimeFormat } from "@/hooks"
import { AlertCircle, MapPin } from "lucide-react"
import { personName, countryFromTz } from "@hbcfield/shared/client"
import { formatTime, formatDateInZone, StatusBadge } from "./attendance-helpers"

/** Shifts clocked in or out outside the workspace's ring — the first five, and how many more. */
export function GeofenceAlerts({ violations }: { violations: TimeEntry[] }) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  if (violations.length === 0) return null
  return (
    <div className="bg-card rounded-2xl border border-amber-200/60 dark:border-amber-500/25 shadow-sm mb-8 overflow-hidden">
      <div className="p-5 border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
              {t("attendance.tracking.geofenceAlerts", { count: violations.length })}
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300/80">
              {t("attendance.tracking.geofenceAlertsDesc")}
            </p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-500/15">
        {violations.slice(0, 5).map((entry: TimeEntry) => (
          <div
            key={entry.id}
            className="p-4 flex items-center justify-between hover:bg-amber-50/30 dark:hover:bg-amber-500/5"
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                firstName={entry.user?.firstName}
                lastName={entry.user?.lastName}

                seed={entry.user?.id}
                size="md"
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
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 " +
                            "text-[11px] font-medium text-amber-600 dark:text-amber-400"
                          }
                        >
                          <MapPin className="size-3" />
                          {t("attendance.tracking.clockInOutside")}
                        </span>
                      )}
                      {entry.clockOutAt && entry.clockOutWithinGeofence === false && (
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 " +
                            "text-[11px] font-medium text-amber-600 dark:text-amber-400"
                          }
                        >
                          <MapPin className="size-3" />
                          {t("attendance.tracking.clockOutOutside")}
                        </span>
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
          <div className="p-3 text-center text-sm text-amber-600">
            {t("attendance.tracking.moreAlerts", { count: violations.length - 5 })}
          </div>
        )}
      </div>
    </div>
  )
}
