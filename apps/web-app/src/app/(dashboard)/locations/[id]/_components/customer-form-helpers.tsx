"use client"

import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** CustomerForm's module-level helpers, moved here unchanged so its sections can read them too. */
// Common industries for the datalist (smart suggestions, still free-text).
export const INDUSTRIES = [
  "Construction", "Real Estate", "Property Management", "Facility Management",
  "Manufacturing", "Retail", "Hospitality", "Healthcare", "Logistics",
  "Energy & Utilities", "Telecommunications", "Automotive", "Agriculture",
  "Education", "Public Sector", "Professional Services", "Technology",
]

export function IconField(
  {
    icon: Icon,
    label,
    value,
    onChange,
    placeholder
  }: { icon: LucideIcon; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Field(
  { label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
