"use client"

import { MapPin } from "lucide-react"
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
        <div className="divide-y divide-border/60">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent/40 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground flex-shrink-0">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{assignment.location.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {assignment.location.address && (
                    <span className="truncate">{assignment.location.address}</span>
                  )}
                  <span>
                    {t('technicians.locationsTab.schedule', { days: assignment.schedule?.join(", ") || t('technicians.locationsTab.allDays') })}
                  </span>
                  <span>
                    {t('technicians.locationsTab.effectiveFrom', { date: formatDate(assignment.effectiveFrom) })}
                  </span>
                </div>
              </div>
              {assignment.isPrimary && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary flex-shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t('technicians.locationsTab.primary')}
                </span>
              )}
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
