"use client"

import { formatDistanceToNow } from "date-fns"
import {
  CheckCircle,
  Target,
  ClipboardList,
  Timer,
  Activity,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { type TechnicianStats } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface OverviewTabProps {
  stats: TechnicianStats | undefined
}

export function OverviewTab({ stats }: OverviewTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('technicians.overview.completionRate')}</p>
                <p className="text-2xl font-semibold text-foreground">
                  {stats?.performance.completionRate?.toFixed(0) || 0}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('technicians.overview.onTimeRate')}</p>
                <p className="text-2xl font-semibold text-foreground">
                  {stats?.performance.onTimeRate?.toFixed(0) || 0}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('technicians.overview.tasksCompleted')}</p>
                <p className="text-2xl font-semibold text-foreground">
                  {stats?.tasks.completed || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('technicians.overview.hoursThisWeek')}</p>
                <p className="text-2xl font-semibold text-foreground">
                  {stats?.attendance.totalHoursThisWeek?.toFixed(1) || 0}h
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Timer className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Tasks & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('technicians.overview.activeTasks')}</CardTitle>
            <CardDescription>
              {t('technicians.overview.activeTasksDescription', { inProgress: stats?.tasks.inProgress || 0, assigned: stats?.tasks.assigned || 0 })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p>{t('technicians.overview.taskDetailsInTab')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('technicians.overview.recentActivity')}</CardTitle>
            <CardDescription>{t('technicians.overview.latestActions')}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
                    <div className="flex-1">
                      <p className="text-foreground">{activity.description}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p>{t('technicians.overview.noRecentActivity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
