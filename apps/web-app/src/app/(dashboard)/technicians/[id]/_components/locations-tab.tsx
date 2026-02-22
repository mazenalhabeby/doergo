"use client"

import { format } from "date-fns"
import { MapPin } from "lucide-react"

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location Assignments</CardTitle>
        <CardDescription>
          Company locations assigned to this technician
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
                  <h4 className="font-medium text-slate-800">
                    {assignment.location.name}
                  </h4>
                  {assignment.isPrimary && (
                    <Badge className="bg-blue-100 text-blue-700">Primary</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-2">
                  {assignment.location.address}
                </p>
                <div className="text-xs text-slate-400">
                  <p>
                    Schedule: {assignment.schedule?.join(", ") || "All days"}
                  </p>
                  <p>
                    Effective from:{" "}
                    {format(new Date(assignment.effectiveFrom), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No location assignments</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
