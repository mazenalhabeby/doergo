"use client"

import { MapPin, CalendarDays, Building2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useTimeFormat } from "@/hooks"

interface Assignment {
  id: string
  locationId: string
  isPrimary: boolean
  schedule: string[]
  effectiveFrom: string
  effectiveTo?: string
  location: {
    id: string
    name: string
    address?: string
  }
}

interface LocationsTabProps {
  assignments: Assignment[] | undefined
}

export function LocationsTab({ assignments }: LocationsTabProps) {
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapPin className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('technicians.locationsTab.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('technicians.locationsTab.description')}</p>
        </div>
      </div>

      {assignments && assignments.length > 0 ? (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="group relative rounded-xl border border-border/60 bg-background/40 p-4 transition-all hover:border-primary/40 hover:shadow-md"
            >
              {/* Primary ribbon pill, top-right */}
              {assignment.isPrimary && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t('technicians.locationsTab.primary')}
                </span>
              )}

              {/* Icon + name + address */}
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0 transition-transform group-hover:scale-105">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 pr-14">
                  <p className="text-sm font-semibold text-foreground truncate">{assignment.location.name}</p>
                  {assignment.location.address && (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{assignment.location.address}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Working days */}
              <div className="mt-3.5 flex flex-wrap gap-1">
                {assignment.schedule && assignment.schedule.length > 0 ? (
                  assignment.schedule.map((day) => (
                    <span
                      key={day}
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
                    >
                      {day}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {t('technicians.locationsTab.allDays')}
                  </span>
                )}
              </div>

              {/* Effective-from footer */}
              <div className="mt-3.5 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                {t('technicians.locationsTab.effectiveFrom', { date: formatDate(assignment.effectiveFrom) })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
            <MapPin className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t('technicians.locationsTab.noAssignments')}</p>
        </div>
      )}
    </div>
  )
}
