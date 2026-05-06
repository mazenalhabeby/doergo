"use client"

import { format } from "date-fns"
import { MapPin } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('technicians.locationsTab.title')}</CardTitle>
        <CardDescription>
          {t('technicians.locationsTab.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {assignments && assignments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className={cn(
                  "border rounded-lg p-4",
                  assignment.isPrimary && "border-blue-500 bg-blue-50"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-foreground">
                    {assignment.location.name}
                  </h4>
                  {assignment.isPrimary && (
                    <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400">{t('technicians.locationsTab.primary')}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {assignment.location.address}
                </p>
                <div className="text-xs text-muted-foreground">
                  <p>
                    {t('technicians.locationsTab.schedule', { days: assignment.schedule?.join(", ") || t('technicians.locationsTab.allDays') })}
                  </p>
                  <p>
                    {t('technicians.locationsTab.effectiveFrom', { date: format(new Date(assignment.effectiveFrom), "MMM d, yyyy") })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>{t('technicians.locationsTab.noAssignments')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
