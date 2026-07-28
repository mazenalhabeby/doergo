"use client"

import {
  Compass, LayoutDashboard, ListChecks, Users, MapPin, Calendar, Clock,
  BarChart3, Settings, UserPlus, PlusCircle, Sparkles, type LucideIcon,
} from "lucide-react"

/** Catalog icon keys → Lucide components (one place, no duplication). */
const ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  dashboard: LayoutDashboard,
  tasks: ListChecks,
  team: Users,
  spaces: MapPin,
  schedule: Calendar,
  attendance: Clock,
  reports: BarChart3,
  settings: Settings,
  invite: UserPlus,
  create: PlusCircle,
  sparkles: Sparkles,
}

export function TourIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Compass
  return <Icon className={className} strokeWidth={2} />
}
