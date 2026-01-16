"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

interface TaskChartData {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface TaskChartProps {
  data: TaskChartData[]
  className?: string
}

export function TaskChart({ data, className }: TaskChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (total === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8", className)}>
        <div className="size-24 rounded-full border-4 border-dashed border-slate-200" />
        <p className="mt-4 text-sm text-slate-400">No data</p>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-8", className)}>
      {/* Chart */}
      <div className="relative size-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={58}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900">{total}</span>
          <span className="text-[11px] text-slate-400">Total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">{item.name}</span>
              <span className="text-sm font-medium text-slate-900">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Muted, sophisticated colors
export const taskStatusColors = {
  NEW: "#64748b",       // slate-500
  ASSIGNED: "#8b5cf6",  // violet-500
  IN_PROGRESS: "#f59e0b", // amber-500
  BLOCKED: "#ef4444",   // red-500
  COMPLETED: "#10b981", // emerald-500
  CANCELED: "#94a3b8",  // slate-400
  DRAFT: "#cbd5e1",     // slate-300
  CLOSED: "#475569",    // slate-600
}

export const priorityColors = {
  LOW: "#94a3b8",
  MEDIUM: "#64748b",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
}
