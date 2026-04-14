"use client"

import { cn } from "@/lib/utils"

// Re-export chart colors from constants for backwards compatibility
export { taskStatusColors, priorityColors } from "@/lib/constants"

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

  // Build SVG arcs for the donut chart
  const size = 128
  const cx = size / 2
  const cy = size / 2
  const outerR = 58
  const innerR = 38
  const gap = 0.02 // small gap in radians between segments

  const arcs: { d: string; color: string }[] = []
  let currentAngle = -Math.PI / 2 // start from top

  for (const item of data) {
    if (item.value === 0) continue
    const sweep = (item.value / total) * Math.PI * 2 - gap
    const startAngle = currentAngle + gap / 2
    const endAngle = startAngle + sweep

    const x1Outer = cx + outerR * Math.cos(startAngle)
    const y1Outer = cy + outerR * Math.sin(startAngle)
    const x2Outer = cx + outerR * Math.cos(endAngle)
    const y2Outer = cy + outerR * Math.sin(endAngle)

    const x1Inner = cx + innerR * Math.cos(endAngle)
    const y1Inner = cy + innerR * Math.sin(endAngle)
    const x2Inner = cx + innerR * Math.cos(startAngle)
    const y2Inner = cy + innerR * Math.sin(startAngle)

    const largeArc = sweep > Math.PI ? 1 : 0

    const d = [
      `M ${x1Outer} ${y1Outer}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
      `Z`,
    ].join(" ")

    arcs.push({ d, color: item.color })
    currentAngle += (item.value / total) * Math.PI * 2
  }

  return (
    <div className={cn("flex items-center gap-8", className)}>
      {/* Chart */}
      <div className="relative size-32 shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((arc, i) => (
            <path key={i} d={arc.d} fill={arc.color} />
          ))}
        </svg>
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
