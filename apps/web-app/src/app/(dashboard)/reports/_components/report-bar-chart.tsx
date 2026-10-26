"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts"

/**
 * The reports bar chart, in its own module so recharts can be code-split.
 *
 * It was a static import on the 720-line reports page (audit R-C1) — the one
 * place in the app where recharts was NOT split. The member-detail Performance tab
 * already loads it with `dynamic()` and says why in a comment; this page missed
 * the same treatment, so every visitor paid for the chart library whether or not a
 * report produced a chart.
 */

interface ReportBarChartProps {
  data: { label: string; value: number }[]
  measureLabel: string
  format: (value: number) => string
}

export function ReportBarChart({ data, measureLabel, format }: ReportBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => format(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <RTooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
          }}
          labelStyle={{ color: "hsl(var(--popover-foreground))" }}
          itemStyle={{ color: "hsl(var(--popover-foreground))" }}
          formatter={((v: unknown) => [format(Number(v)), measureLabel]) as never}
        />
        {/* One series, one colour — the board's accent bars. */}
        <Bar dataKey="value" radius={[0, 7, 7, 0]} maxBarSize={14} fill="var(--shell-accent)" />
      </BarChart>
    </ResponsiveContainer>
  )
}
