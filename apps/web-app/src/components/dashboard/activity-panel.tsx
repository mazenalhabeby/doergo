"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { Check, X, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useActivityPanel, useRegisterActivityPanel } from "@/contexts/activity-panel-context"

// ─── Activity Feed Types ───

export interface LiveEvent {
  id: string
  dot: "green" | "blue" | "amber" | "red" | "purple"
  message: React.ReactNode
  time: string
}

export interface PendingAction {
  id: string
  initials: string
  color: string
  imageUrl?: string
  title: string
  description: string
  onApprove?: () => void
  onReject?: () => void
  onMessage?: () => void
}

export interface ActivityPanelProps {
  events: LiveEvent[]
  pending: PendingAction[]
  className?: string
}

const DOT_COLORS = {
  green: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
  blue: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]",
  amber: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]",
  red: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]",
  purple: "bg-purple-500 shadow-[0_0_6px_rgba(139,92,246,0.5)]",
} as const

export function ActivityPanel({ events, pending, className }: ActivityPanelProps) {
  const { t } = useTranslation()
  const { isOpen } = useActivityPanel()
  useRegisterActivityPanel() // tell the support button a panel is docked here

  return (
    <div
      className={cn(
        "border-l border-border bg-background/80 backdrop-blur-xl",
        "flex flex-col overflow-hidden shrink-0",
        "transition-all duration-300",
        isOpen ? "w-[300px]" : "w-0 border-l-0 opacity-0",
        className,
      )}
    >
        {/* Recent Activity — 2/3 */}
        <div data-tour="dash-activity" className="flex-[2] flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-foreground/[0.03]">
            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-wider">
              {t("dashboard.recentActivity", "Recent Activity")}
            </span>
            {events.length > 0 && (
              <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {t("dashboard.eventsCount", "{{count}} events", { count: events.length })}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                {t("dashboard.noRecentActivity", "No recent activity")}
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", DOT_COLORS[event.dot])} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_strong]:font-medium">
                      {event.message}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">{event.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Actions — 1/3 */}
        {pending.length > 0 && (
          <div data-tour="dash-pending" className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-border">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-foreground/[0.03]">
              <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-wider">
                {t("dashboard.pendingActions", "Pending Actions")}
              </span>
              <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {pending.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 overflow-hidden"
                    style={{ background: action.color }}
                  >
                    {action.imageUrl ? (
                      <img src={action.imageUrl} alt={action.initials} className="w-full h-full object-cover" />
                    ) : (
                      action.initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{action.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{action.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {action.onApprove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={action.onApprove}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {action.onReject && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={action.onReject}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {action.onMessage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                        onClick={action.onMessage}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  )
}
