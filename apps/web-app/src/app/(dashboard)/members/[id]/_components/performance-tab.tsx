"use client"

import { format, parseISO } from "date-fns"
import {
  BarChart3,
  CheckCircle2,
  Clock,
  ListChecks,
  Activity,
  GitCompareArrows,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
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
import { cn } from "@/lib/utils"

interface PerformanceTabProps {
  performance: PerformanceMetrics | undefined
}

// Small green/red delta pill with a directional arrow, used on the stat tiles
// and inside the period-comparison card.
function Delta({ value, label }: { value: number; label: string }) {
  const up = value >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-green-600" : "text-red-600"
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {label}
    </span>
  )
}

export function PerformanceTab({ performance }: PerformanceTabProps) {
  const { t } = useTranslation()

  const comparison = performance?.comparison

  return (
    <div className="space-y-6">
      {/* ── Stat tiles ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold text-foreground">
            {performance?.summary.completionRate?.toFixed(0) || 0}%
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.completionRate')}</p>
            {comparison && (
              <Delta
                value={comparison.completionRateChange}
                label={`${comparison.completionRateChange.toFixed(1)}%`}
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold text-foreground">
            {performance?.summary.onTimeRate?.toFixed(0) || 0}%
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.onTimeRate')}</p>
            {comparison && (
              <Delta
                value={comparison.onTimeRateChange}
                label={`${comparison.onTimeRateChange.toFixed(1)}%`}
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListChecks className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold text-foreground">
            {performance?.summary.tasksCompleted || 0}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.tasksCompleted')}</p>
            {comparison && (
              <Delta
                value={comparison.tasksCompletedChange}
                label={`${comparison.tasksCompletedChange.toFixed(0)}%`}
              />
            )}
          </div>
        </div>

      </div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Completed Chart */}
        <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('technicians.performanceTab.tasksCompletedChart')}</h2>
              <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.dailyTaskCompletion')}</p>
            </div>
          </div>
          {performance?.trends && performance.trends.length > 0 ? (
            <div className="p-5">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={performance.trends.map((t) => ({
                      ...t,
                      dateLabel: format(parseISO(t.date), "MMM d"),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
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
            </div>
          ) : (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <BarChart3 className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted-foreground">{t('technicians.performanceTab.noPerformanceData')}</p>
            </div>
          )}
        </div>

        {/* On-Time Rate & Hours Worked Chart */}
        <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('technicians.performanceTab.performanceMetrics')}</h2>
              <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.onTimeRateAndHours')}</p>
            </div>
          </div>
          {performance?.trends && performance.trends.length > 0 ? (
            <div className="p-5">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={performance.trends.map((t) => ({
                      ...t,
                      dateLabel: format(parseISO(t.date), "MMM d"),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      domain={[0, 100]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
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
            </div>
          ) : (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <BarChart3 className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted-foreground">{t('technicians.performanceTab.noPerformanceData')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Period Comparison ────────────────────────────────────── */}
      {comparison && (
        <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitCompareArrows className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('technicians.performanceTab.periodComparison')}</h2>
              <p className="text-xs text-muted-foreground">{t('technicians.performanceTab.changeComparedToPrevious')}</p>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-1.5">{t('technicians.performanceTab.completionRate')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    comparison.completionRateChange >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {comparison.completionRateChange >= 0 ? "+" : ""}
                  {comparison.completionRateChange.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-1.5">{t('technicians.performanceTab.onTimeRate')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    comparison.onTimeRateChange >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {comparison.onTimeRateChange >= 0 ? "+" : ""}
                  {comparison.onTimeRateChange.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-1.5">{t('technicians.performanceTab.rating')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    comparison.ratingChange >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {comparison.ratingChange >= 0 ? "+" : ""}
                  {comparison.ratingChange.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-1.5">{t('technicians.performanceTab.tasksCompleted')}</p>
                <p
                  className={cn(
                    "text-xl font-semibold",
                    comparison.tasksCompletedChange >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {comparison.tasksCompletedChange >= 0 ? "+" : ""}
                  {comparison.tasksCompletedChange.toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
