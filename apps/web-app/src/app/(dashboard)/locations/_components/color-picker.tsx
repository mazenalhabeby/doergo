"use client"

import { memo } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4",
  "#10b981", "#22c55e", "#f59e0b",
  "#f97316", "#ef4444", "#ec4899",
  "#64748b", "#78716c", "#000000",
] as const

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

const ColorPicker = memo(function ColorPicker({
  value,
  onChange,
  disabled,
}: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="w-5 h-5 rounded-full border border-border shrink-0 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
          style={{ backgroundColor: value }}
          aria-label="Pick color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-2" align="start" sideOffset={6}>
        <div className="grid grid-cols-6 gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`w-6 h-6 rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring ${
                value === color
                  ? "ring-2 ring-ring ring-offset-1"
                  : ""
              }`}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
})

export { ColorPicker, PRESET_COLORS }
