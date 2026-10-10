"use client"

import { personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"

import { tasksApi } from "@/lib/api"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { EXCLUDED_EVENTS, getEventConfig, getEventDescription } from "./activity-events"
import { cn } from "@/lib/utils"
import { formatTimeAgo } from "@/lib/format-date"
import { Skeleton } from "@/components/ui/skeleton"

interface ActivitySectionProps {
  taskId: string
  /** Reports how many events there are, so the section header can show a count
   *  without the parent subscribing to a query it does not otherwise need. */
  onCountChange?: (count: number) => void
}

export function ActivitySection({ taskId, onCountChange }: ActivitySectionProps) {
  const { t } = useTranslation()
  // The history sits at the foot of the page; it is read once the task itself
  // and what it is doing have loaded (useAfterFirstLoad). Until then the
  // skeleton below holds its place.
  const afterFirstLoad = useAfterFirstLoad(1)
  const { data: events, isLoading: loadingEvents, isError } = useQuery({
    queryKey: keys.tasks.timeline(taskId),
    queryFn: () => tasksApi.getTimeline(taskId),
    enabled: afterFirstLoad,
  })
  const isLoading = loadingEvents || (!afterFirstLoad && !events)

  const filteredEvents = events?.filter(
    (event) => !EXCLUDED_EVENTS.includes(event.eventType)
  ) || []

  const activityCount = filteredEvents.length
  useEffect(() => {
    onCountChange?.(activityCount)
  }, [activityCount, onCountChange])

  /*
    Content only — no card, no header.
    
    CollapsibleSection already draws the card, the Clock icon, the "Activity"
    title and the count, so drawing them again here produced a section headed
    Activity containing a box headed Activity. Every sibling section on this
    page is content-only; this one had not been.
    
    The list scrolls at the same height it did before, but as a max rather than
    a fixed one, so a task with three events no longer reserves 400px of empty
    space inside a panel you opened to read three events.
  */
  return (
    <div className="max-h-[360px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="size-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError || filteredEvents.length === 0 ? (
          <div className="text-center py-4">
            <Clock className="size-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">{t('tasks.activity.noActivity')}</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-2.5 top-2 bottom-2 w-px bg-muted" />

            <div className="space-y-3">
              {filteredEvents.map((event) => {
                const config = getEventConfig(event.eventType)
                const Icon = config.icon

                return (
                  <div key={event.id} className="relative flex gap-2.5 pl-0">
                    <div className="relative z-10 size-5 rounded-full bg-card flex items-center justify-center ring-2 ring-border">
                      <Icon className={cn("size-3", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs text-foreground leading-tight">
                        {getEventDescription(event, t)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {personName(event.user)} · {formatTimeAgo(event.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
    </div>
  )
}
