"use client"

import { ArrowDown, Minus, ArrowUp, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

interface PrioritySelectorProps {
  value: Priority
  onChange: (priority: Priority) => void
  disabled?: boolean
  className?: string
}

const PRIORITY_OPTIONS: {
  value: Priority
  label: string
  icon: typeof ArrowDown
  activeClass: string
  hoverClass: string
}[] = [
  {
    value: "LOW",
    label: "Low",
    icon: ArrowDown,
    activeClass: "border-slate-900 bg-slate-900 text-white",
    hoverClass: "hover:border-slate-300",
  },
  {
    value: "MEDIUM",
    label: "Medium",
    icon: Minus,
    activeClass: "border-blue-600 bg-blue-600 text-white",
    hoverClass: "hover:border-blue-300",
  },
  {
    value: "HIGH",
    label: "High",
    icon: ArrowUp,
    activeClass: "border-amber-600 bg-amber-600 text-white",
    hoverClass: "hover:border-amber-300",
  },
  {
    value: "URGENT",
    label: "Urgent",
    icon: AlertTriangle,
    activeClass: "border-red-600 bg-red-600 text-white",
    hoverClass: "hover:border-red-300",
  },
]

export function PrioritySelector({
  value,
  onChange,
  disabled = false,
  className,
}: PrioritySelectorProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PRIORITY_OPTIONS.map((option) => {
        const Icon = option.icon
        const isSelected = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200",
              isSelected
                ? option.activeClass
                : cn("border-slate-200 text-slate-600", option.hoverClass),
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon className="size-4" />
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
