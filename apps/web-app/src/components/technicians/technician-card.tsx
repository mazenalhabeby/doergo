"use client"

import { Star, Briefcase, Clock, MapPin, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface TechnicianData {
  id: string
  firstName: string
  lastName: string
  rating?: number
  specialty?: string
  status?: "Available" | "Busy" | "On vacation"
  currentJobs?: number
  availableAt?: string
  distance?: string
}

interface TechnicianCardProps {
  technician: TechnicianData
  onAssign: (id: string) => void
  isAssigning?: boolean
  variant?: "suggested" | "list"
  className?: string
}

export function TechnicianCard({
  technician,
  onAssign,
  isAssigning = false,
  variant = "list",
  className,
}: TechnicianCardProps) {
  const initials = `${technician.firstName[0]}${technician.lastName[0]}`
  const isOnVacation = technician.status === "On vacation"
  const isBusy = technician.status === "Busy"
  const isAvailable = technician.status === "Available"

  if (variant === "suggested") {
    return (
      <div className={cn("px-6 py-4 bg-slate-50 border-b border-gray-100", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-blue-100 text-blue-600 font-medium text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Suggested Technician:</span>
                <span className="text-sm font-medium text-gray-900">
                  {technician.firstName} {technician.lastName}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {technician.availableAt || "Available today"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-xs h-8 px-4"
            onClick={() => onAssign(technician.id)}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "Assign Automatically"
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "px-6 py-4 flex items-center justify-between hover:bg-gray-50",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-11">
          <AvatarFallback className="bg-orange-100 text-orange-600 font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {technician.firstName} {technician.lastName}
            </span>
            {technician.rating && (
              <>
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <span className="text-sm text-gray-600">
                  {technician.rating.toFixed(1)}
                </span>
              </>
            )}
          </div>
          {technician.specialty && (
            <p className="text-sm text-gray-500">{technician.specialty}</p>
          )}
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
            {technician.status && (
              <span
                className={cn(
                  "flex items-center gap-1",
                  isAvailable && "text-green-600",
                  isBusy && "text-amber-600",
                  isOnVacation && "text-gray-400"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isAvailable && "bg-green-500",
                    isBusy && "bg-amber-500",
                    isOnVacation && "bg-gray-300"
                  )}
                />
                {technician.status}
              </span>
            )}
            {technician.currentJobs !== undefined && (
              <span className="flex items-center gap-1">
                <Briefcase className="size-3" />
                {technician.currentJobs} Jobs
              </span>
            )}
            {technician.availableAt && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {technician.availableAt}
              </span>
            )}
            {technician.distance && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {technician.distance}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        className={cn(
          "h-8 px-4 text-xs",
          isBusy ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"
        )}
        onClick={() => onAssign(technician.id)}
        disabled={isAssigning || isOnVacation}
      >
        Assign
      </Button>
    </div>
  )
}
