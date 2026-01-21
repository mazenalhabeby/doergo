"use client"

import { CheckCircle2 } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const STEP_LABELS = [
  "Company Accepted",
  "Technician Assigned",
  "Work in Progress",
  "Completed",
]

interface AssignedUser {
  firstName: string
  lastName: string
  email?: string
  specialty?: string | null
}

interface TaskProgressCardProps {
  assignedTo: AssignedUser
  currentStep: number
  isCompleted: boolean
  taskStatus?: string
}

export function TaskProgressCard({
  assignedTo,
  currentStep,
  isCompleted,
  taskStatus,
}: TaskProgressCardProps) {
  // Determine technician status based on task status
  const getStatusLabel = () => {
    switch (taskStatus) {
      case "EN_ROUTE":
        return "En route"
      case "ARRIVED":
      case "IN_PROGRESS":
        return "On site"
      case "COMPLETED":
      case "CLOSED":
        return "Completed"
      case "BLOCKED":
        return "Blocked"
      default:
        return "Assigned"
    }
  }

  const statusLabel = getStatusLabel()
  const isOnSite = taskStatus === "ARRIVED" || taskStatus === "IN_PROGRESS"
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
      <div className="flex gap-6">
        {/* Progress Section */}
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            {isCompleted ? "Maintenance Completed" : "Your Task is in Progress"}
          </h3>
          {isCompleted && (
            <p className="text-sm text-gray-500 mb-4">
              The technician has finished all required work. Please review the
              final report before signing.
            </p>
          )}

          {/* Stepper */}
          <div className="flex items-center mt-6">
            {STEP_LABELS.map((label, index) => (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "size-8 rounded-full flex items-center justify-center text-sm font-medium border-2",
                      index < currentStep
                        ? "bg-blue-600 border-blue-600 text-white"
                        : index === currentStep
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-200 text-gray-400"
                    )}
                  >
                    {index < currentStep ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <span className="size-2 rounded-full bg-current" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 text-center max-w-[80px]",
                      index <= currentStep
                        ? "text-gray-900 font-medium"
                        : "text-gray-400"
                    )}
                  >
                    {label}
                  </span>
                </div>
                {index < STEP_LABELS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 -mt-6 mx-2",
                      index < currentStep ? "bg-blue-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Technician Card */}
        <div className="w-64 border-l border-gray-100 pl-6">
          <p className="text-xs text-gray-400 mb-3">Technician</p>
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="size-12">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium">
                {assignedTo.firstName[0]}
                {assignedTo.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-gray-900">
                {assignedTo.firstName} {assignedTo.lastName}
              </p>
              {assignedTo.specialty && (
                <p className="text-xs text-gray-500">{assignedTo.specialty}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
            <span className="flex items-center gap-1">
              <span className={cn(
                "size-2 rounded-full",
                isOnSite ? "bg-green-500" : "bg-blue-500"
              )} />
              {statusLabel}
            </span>
          </div>
          {assignedTo.email && (
            <p className="text-xs text-gray-500 mb-4 truncate">
              {assignedTo.email}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
