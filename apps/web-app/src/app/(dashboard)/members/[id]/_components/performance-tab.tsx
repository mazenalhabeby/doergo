"use client"

import type { ComponentType, ReactNode } from "react"
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

import { type PerformanceMetrics } from "@/lib/api"
import { cn } from "@/lib/utils"
import { StatTile } from "@/components/ui/stat-tile"

interface PerformanceTabProps {
  performance: PerformanceMetrics | undefined
}

type Icon = ComponentType<{ className?: string }>

const AXIS_TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" }
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
}

// Small green/red delta pill with a directional arrow, used on the stat tiles
// and inside the period-comparison card.
function Delta({ value, label }: { value: number; label: string }) {
  const up = value >= 0
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-green-600" : "text-red-600")}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {label}
    </span>
  )
}

// A titled card: the charts and the period comparison share its header.
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: Icon
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * A daily trend chart, or the empty state when there is no data. The axes and
 * lines are passed as keyed arrays so their order — which is their drawing
 * order — stays exactly what each chart declares.
 */
function TrendChart({
  trends,
  yAxes,
  legend,
  lines,
}: {
  trends: PerformanceMetrics["trends"] | undefined
  yAxes: ReactNode[]
  legend?: boolean
  lines: ReactNode[]
}) {
  const { t } = useTranslation()
  if (!trends || trends.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
          <BarChart3 className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground">{t("technicians.performanceTab.noPerformanceData")}</p>
      </div>
    )
  }
  return (
    <div className="p-5">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={trends.map((point) => ({
              ...point,
              dateLabel: format(parseISO(point.date), "MMM d"),
            }))}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dateLabel" tick={AXIS_TICK} />
            {yAxes}
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            {legend && <Legend />}
            {lines}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function trendLine(key: string, dataKey: string, color: string, name: string, yAxisId?: string) {
  return (
    <Line
      key={key}
      {...(yAxisId ? { yAxisId } : {})}
      type="monotone"
      dataKey={dataKey}
      stroke={color}
      strokeWidth={2}
      dot={{ fill: color, strokeWidth: 2 }}
      name={name}
    />
  )
}

function ComparisonCell({
  label,
  change,
  digits,
  suffix = "",
}: {
  label: string
  change: number
  digits: number
  suffix?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p className={cn("text-xl font-semibold", change >= 0 ? "text-green-600" : "text-red-600")}>
        {change >= 0 ? "+" : ""}
        {change.toFixed(digits)}
        {suffix}
      </p>
    </div>
  )
}

export function PerformanceTab({ performance }: PerformanceTabProps) {
  const { t } = useTranslation()

  const comparison = performance?.comparison
  const delta = (change: number, digits: number) => <Delta value={change} label={`${change.toFixed(digits)}%`} />

  return (
    <div className="space-y-6">
      {/* ── Stat tiles ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={CheckCircle2}
          value={<>{performance?.summary.completionRate?.toFixed(0) || 0}%</>}
          label={t("technicians.performanceTab.completionRate")}
          delta={comparison && delta(comparison.completionRateChange, 1)}
        />

        <StatTile
          icon={Clock}
          value={<>{performance?.summary.onTimeRate?.toFixed(0) || 0}%</>}
          label={t("technicians.performanceTab.onTimeRate")}
          delta={comparison && delta(comparison.onTimeRateChange, 1)}
        />

        <StatTile
          icon={ListChecks}
          value={performance?.summary.tasksCompleted || 0}
          label={t("technicians.performanceTab.tasksCompleted")}
          delta={comparison && delta(comparison.tasksCompletedChange, 0)}
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Completed Chart */}
        <SectionCard
          icon={BarChart3}
          title={t("technicians.performanceTab.tasksCompletedChart")}
          subtitle={t("technicians.performanceTab.dailyTaskCompletion")}
        >
          <TrendChart
            trends={performance?.trends}
            yAxes={[<YAxis key="y" tick={AXIS_TICK} />]}
            lines={[
              trendLine("completed", "completedTasks", "#8b5cf6", t("technicians.performanceTab.tasksCompletedChart")),
            ]}
          />
        </SectionCard>

        {/* On-Time Rate & Hours Worked Chart */}
        <SectionCard
          icon={Activity}
          title={t("technicians.performanceTab.performanceMetrics")}
          subtitle={t("technicians.performanceTab.onTimeRateAndHours")}
        >
          <TrendChart
            trends={performance?.trends}
            yAxes={[
              <YAxis key="left" yAxisId="left" tick={AXIS_TICK} domain={[0, 100]} />,
              <YAxis key="right" yAxisId="right" orientation="right" tick={AXIS_TICK} />,
            ]}
            legend
            lines={[
              trendLine("onTime", "onTimeRate", "#2563eb", t("technicians.performanceTab.onTimeRatePercent"), "left"),
              trendLine("hours", "hoursWorked", "#16a34a", t("technicians.performanceTab.hoursWorked"), "right"),
            ]}
          />
        </SectionCard>
      </div>

      {/* ── Period Comparison ────────────────────────────────────── */}
      {comparison && (
        <SectionCard
          icon={GitCompareArrows}
          title={t("technicians.performanceTab.periodComparison")}
          subtitle={t("technicians.performanceTab.changeComparedToPrevious")}
        >
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ComparisonCell
                label={t("technicians.performanceTab.completionRate")}
                change={comparison.completionRateChange}
                digits={1}
                suffix="%"
              />
              <ComparisonCell
                label={t("technicians.performanceTab.onTimeRate")}
                change={comparison.onTimeRateChange}
                digits={1}
                suffix="%"
              />
              <ComparisonCell
                label={t("technicians.performanceTab.rating")}
                change={comparison.ratingChange}
                digits={2}
              />
              <ComparisonCell
                label={t("technicians.performanceTab.tasksCompleted")}
                change={comparison.tasksCompletedChange}
                digits={0}
                suffix="%"
              />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
