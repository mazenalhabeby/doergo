"use client"

import { format, parseISO } from "date-fns"
import { BarChart3 } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { type PerformanceMetrics } from "@/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PerformanceTabProps {
  performance: PerformanceMetrics | undefined
}

export function PerformanceTab({ performance }: PerformanceTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.completionRate')}</p>
              <p className="text-3xl font-bold text-green-600">
                {performance?.summary.completionRate?.toFixed(0) || 0}%
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.onTimeRate')}</p>
              <p className="text-3xl font-bold text-blue-600">
                {performance?.summary.onTimeRate?.toFixed(0) || 0}%
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.tasksCompleted')}</p>
              <p className="text-3xl font-bold text-purple-600">
                {performance?.summary.tasksCompleted || 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Completed Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('technicians.performanceTab.tasksCompletedChart')}</CardTitle>
            <CardDescription>
              {t('technicians.performanceTab.dailyTaskCompletion')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {performance?.trends && performance.trends.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={performance.trends.map((t) => ({
                      ...t,
                      dateLabel: format(parseISO(t.date), "MMM d"),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completedTasks"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: "#8b5cf6", strokeWidth: 2 }}
                      name={t('technicians.performanceTab.tasksCompletedChart')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground bg-muted rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p>{t('technicians.performanceTab.noPerformanceData')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* On-Time Rate & Hours Worked Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('technicians.performanceTab.performanceMetrics')}</CardTitle>
            <CardDescription>
              {t('technicians.performanceTab.onTimeRateAndHours')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {performance?.trends && performance.trends.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={performance.trends.map((t) => ({
                      ...t,
                      dateLabel: format(parseISO(t.date), "MMM d"),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      domain={[0, 100]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="onTimeRate"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ fill: "#2563eb", strokeWidth: 2 }}
                      name={t('technicians.performanceTab.onTimeRatePercent')}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="hoursWorked"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ fill: "#16a34a", strokeWidth: 2 }}
                      name={t('technicians.performanceTab.hoursWorked')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground bg-muted rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p>{t('technicians.performanceTab.noPerformanceData')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Period Comparison */}
      {performance?.comparison && (
        <Card>
          <CardHeader>
            <CardTitle>{t('technicians.performanceTab.periodComparison')}</CardTitle>
            <CardDescription>
              {t('technicians.performanceTab.changeComparedToPrevious')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.completionRate')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    performance.comparison.completionRateChange >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {performance.comparison.completionRateChange >= 0 ? "+" : ""}
                  {performance.comparison.completionRateChange.toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.onTimeRate')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    performance.comparison.onTimeRateChange >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {performance.comparison.onTimeRateChange >= 0 ? "+" : ""}
                  {performance.comparison.onTimeRateChange.toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.rating')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    performance.comparison.ratingChange >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {performance.comparison.ratingChange >= 0 ? "+" : ""}
                  {performance.comparison.ratingChange.toFixed(2)}
                </p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t('technicians.performanceTab.tasksCompleted')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    performance.comparison.tasksCompletedChange >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {performance.comparison.tasksCompletedChange >= 0 ? "+" : ""}
                  {performance.comparison.tasksCompletedChange.toFixed(0)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
