"use client"

import React from "react"
import { AlertTriangle, CalendarOff, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { PersonNodeProps } from "../person-node"
import { APPLE_EASE } from "./constants"

const ABSENCE_INFO: Record<string, { labelKey: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  time_off: {
    labelKey: "workspace.absenceReason.time_off",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    icon: <CalendarOff className="h-3.5 w-3.5" />
  },
  sick: {
    labelKey: "workspace.absenceReason.sick",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    icon: <AlertTriangle className="h-3.5 w-3.5" />
  },
  day_off: {
    labelKey: "workspace.absenceReason.day_off",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    icon: <CalendarOff className="h-3.5 w-3.5" />
  },
  unexcused: {
    labelKey: "workspace.absenceReason.unexcused",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    icon: <ShieldAlert className="h-3.5 w-3.5" />
  },
}

export const OffDutyRow = React.memo(function OffDutyRow(
  { person, delay = 0, canSeeAbsenceReason = false }: { person: PersonNodeProps; delay?: number; canSeeAbsenceReason?: boolean }) {
  const { t } = useTranslation()
  // Absence reason (Sick / Unexcused / …) is HR-sensitive — admins & managers
  // only. And only when the reason is actually KNOWN (never default to
  // "Unexcused", which wrongly flags everyone who's simply off-shift).
  const info = canSeeAbsenceReason && person.absenceReason ? ABSENCE_INFO[person.absenceReason] : undefined

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 dark:bg-background/20 border border-border/30"
      style={{ animation: `expandCardIn 0.4s ${APPLE_EASE} ${delay}s both` }}
    >
      <div
        className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white opacity-60"
        style={{ background: person.color }}
      >
        {person.imageUrl ? (
          <img
            src={person.imageUrl}
            alt={person.initials}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover opacity-100"
          />
        ) : (
          person.initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground/70">{person.name}</div>
      </div>
      {info && (
        <div
          className={cn(
            ("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] " + "font-semibold shrink-0"),
            info.color,
            info.bgColor)}>
          {info.icon}
          {t(info.labelKey)}
        </div>
      )}
    </div>
  )
})
