import { type BreakSummary } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { Coffee, Clock, TrendingUp, Users, UtensilsCrossed, Pause } from "lucide-react"
import { formatDuration } from "@hbcfield/shared/client"
import { StatCard } from "./attendance-helpers"

/** The Breaks tab's figures for the day: totals, and the same per break type. */
export function BreakStats({
  breakSummary,
  loadingBreakSummary,
  activeCount,
}: {
  breakSummary?: BreakSummary
  loadingBreakSummary: boolean
  /** Members on a break right now. */
  activeCount: number
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* Break Statistics */}
      {!loadingBreakSummary && breakSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title={t("attendance.breaks.totalBreaks")}
            value={breakSummary.totalBreaks}
            icon={Coffee}
            color="blue"
          />
          <StatCard
            title={t("attendance.breaks.totalBreakTime")}
            value={formatDuration(breakSummary.totalBreakMinutes)}
            icon={Clock}
            color="amber"
          />
          <StatCard
            title={t("attendance.breaks.averageBreak")}
            value={formatDuration(breakSummary.averageBreakMinutes)}
            icon={TrendingUp}
            color="green"
          />
          <StatCard title={t("attendance.breaks.activeNow")} value={activeCount} icon={Users} color="slate" />
        </div>
      )}

      {/* Break Stats by Type */}
      {!loadingBreakSummary && breakSummary && breakSummary.totalBreaks > 0 && (
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-6 mb-6">
          <h3 className="text-md font-semibold text-foreground mb-4">{t("attendance.breaks.breaksByType")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <UtensilsCrossed className="size-5 text-amber-600" />
                <p className="font-medium text-amber-900 dark:text-amber-300">{t("attendance.breaks.lunchBreaks")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-300">
                    {breakSummary.breaksByType?.LUNCH?.count || 0}
                  </p>
                  <p className="text-xs text-amber-600">{t("attendance.breaks.count")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-300">
                    {formatDuration(breakSummary.breaksByType?.LUNCH?.totalMinutes || 0)}
                  </p>
                  <p className="text-xs text-amber-600">{t("attendance.breaks.total")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-300">
                    {formatDuration(breakSummary.breaksByType?.LUNCH?.averageMinutes || 0)}
                  </p>
                  <p className="text-xs text-amber-600">{t("attendance.breaks.avg")}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="size-5 text-blue-600" />
                <p className="font-medium text-blue-900 dark:text-blue-300">{t("attendance.breaks.shortBreaks")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    {breakSummary.breaksByType?.SHORT?.count || 0}
                  </p>
                  <p className="text-xs text-blue-600">{t("attendance.breaks.count")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    {formatDuration(breakSummary.breaksByType?.SHORT?.totalMinutes || 0)}
                  </p>
                  <p className="text-xs text-blue-600">{t("attendance.breaks.total")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    {formatDuration(breakSummary.breaksByType?.SHORT?.averageMinutes || 0)}
                  </p>
                  <p className="text-xs text-blue-600">{t("attendance.breaks.avg")}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Pause className="size-5 text-muted-foreground" />
                <p className="font-medium text-foreground">{t("attendance.breaks.otherBreaks")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-foreground">{breakSummary.breaksByType?.OTHER?.count || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("attendance.breaks.count")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {formatDuration(breakSummary.breaksByType?.OTHER?.totalMinutes || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("attendance.breaks.total")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {formatDuration(breakSummary.breaksByType?.OTHER?.averageMinutes || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("attendance.breaks.avg")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
