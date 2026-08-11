"use client"

import { useEffect, useState } from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  title: string
  value: number
  icon: LucideIcon
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  description?: string
  className?: string
}

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 800
    const steps = 20
    const increment = value / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current = Math.min(Math.round(increment * step), value)
      setDisplayValue(current)

      if (step >= steps) {
        clearInterval(timer)
        setDisplayValue(value)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return <>{displayValue.toLocaleString()}</>
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  description,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border bg-card p-6 shadow-sm",
        "transition-all duration-300 ease-out",
        "hover:border-foreground/20 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <span className="text-[13px] font-medium tracking-wide text-muted-foreground">
            {title}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              <AnimatedNumber value={value} />
            </span>
            {trend && trendValue && (
              <span
                className={cn(
                  "text-xs font-medium",
                  trend === "up" && "text-emerald-600",
                  trend === "down" && "text-rose-600",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {trend === "up" && "↑ "}
                {trend === "down" && "↓ "}
                {trendValue}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="rounded-xl bg-muted p-2.5 transition-colors group-hover:bg-accent">
          <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  )
}
