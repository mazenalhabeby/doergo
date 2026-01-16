"use client"

import { MapPin, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TeamMember {
  id: string
  name: string
  avatar?: string
  status: "online" | "busy" | "offline"
  currentTask?: string
  location?: string
  completedToday: number
}

const statusConfig = {
  online: { color: "bg-emerald-500", label: "Available" },
  busy: { color: "bg-amber-500", label: "On Task" },
  offline: { color: "bg-slate-300", label: "Offline" },
}

interface TeamStatusProps {
  members: TeamMember[]
  className?: string
}

export function TeamStatus({ members, className }: TeamStatusProps) {
  const onlineCount = members.filter(m => m.status !== "offline").length

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-slate-500">
          <span className="font-medium text-slate-900">{onlineCount}</span> of {members.length} online
        </span>
        <div className="flex items-center gap-4">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn("size-2 rounded-full", config.color)} />
              <span className="text-[11px] text-slate-400">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="space-y-2">
        {members.map((member) => {
          const config = statusConfig[member.status]

          return (
            <div
              key={member.id}
              className={cn(
                "group flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4",
                "transition-all duration-200",
                "hover:border-slate-200 hover:bg-white"
              )}
            >
              {/* Avatar */}
              <div className="relative">
                <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600">
                  {member.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white",
                    config.color
                  )}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">
                    {member.name}
                  </span>
                </div>
                {member.currentTask ? (
                  <p className="text-[13px] text-slate-500 truncate">
                    {member.currentTask}
                  </p>
                ) : member.location ? (
                  <p className="text-[13px] text-slate-400 truncate flex items-center gap-1">
                    <MapPin className="size-3" />
                    {member.location}
                  </p>
                ) : null}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2 className="size-4" strokeWidth={1.5} />
                <span className="text-sm font-medium">{member.completedToday}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
