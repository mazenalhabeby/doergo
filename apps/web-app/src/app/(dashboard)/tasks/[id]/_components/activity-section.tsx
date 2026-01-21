"use client"

import { Clock } from "lucide-react"
import { ActivityTimeline } from "./activity-timeline"

interface ActivitySectionProps {
  taskId: string
}

export function ActivitySection({ taskId }: ActivitySectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm h-full">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="size-4 text-gray-400" />
          Activity
        </h3>
      </div>
      <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(100% - 73px)" }}>
        <ActivityTimeline taskId={taskId} />
      </div>
    </div>
  )
}
