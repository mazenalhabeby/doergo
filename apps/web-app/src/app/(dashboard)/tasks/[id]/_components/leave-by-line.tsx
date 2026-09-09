"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Car } from "lucide-react"
import { trackingApi, type Task } from "@/lib/api"
import {
  departureAdvice,
  straightLineTravel,
  haversineDistance,
  needsTravelEstimate,
} from "@hbcfield/shared/client"

/**
 * "Leave by 12:13" under a due date that names an hour.
 *
 * The member's phone already works this out from its own GPS. A dispatcher
 * looking at the same task has no GPS of their own to offer, so this asks where
 * the assignee was last seen and does the same arithmetic — the point being
 * that the person planning the day can see whether the day is possible.
 *
 * ⚠️ The one rule lives in shared (`departureAdvice`). This renders it. A second
 * implementation of "when should they leave" is a second answer, and the
 * dispatcher and the member disagreeing about it is worse than neither knowing.
 *
 * ⚠️ Asks for nothing it does not need. The query is disabled unless the task
 * names an hour, sits today, has coordinates and has somebody assigned —
 * `needsTravelEstimate` is the same gate the phone uses. Most tasks make no
 * request at all.
 */
export function LeaveByLine({ task }: { task: Task }) {
  const { t } = useTranslation()

  const wanted = needsTravelEstimate(task as any) && !!task.assignedToId

  const { data: where } = useQuery({
    queryKey: ["worker-location", task.assignedToId],
    queryFn: () => trackingApi.getWorkerLocation(task.assignedToId!),
    enabled: wanted,
    // A position from a few minutes ago moves the answer by seconds; refetching
    // on every focus would put a request behind every tab switch.
    staleTime: 3 * 60 * 1000,
    retry: false,
  })

  if (!wanted || !where?.lat || !where?.lng) return null

  const travel = straightLineTravel(
    haversineDistance(where.lat, where.lng, task.locationLat!, task.locationLng!),
  )
  const advice = departureAdvice({
    now: new Date(),
    appointment: task.dueDate ? new Date(task.dueDate) : null,
    travel,
  })
  if (!advice.leaveAt) return null

  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const late = advice.state === "late"

  return (
    <div className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${late ? "text-destructive" : "text-muted-foreground"}`}>
      <Car className="size-3 shrink-0" />
      <span>
        {late
          ? t("tasks.sidebar.leaveByLate", {
              defaultValue: "Would arrive {{time}} — {{count}} min late",
              time: advice.arriveAt ? time(advice.arriveAt) : "",
              count: advice.lateByMinutes,
            })
          : t("tasks.sidebar.leaveBy", {
              defaultValue: "Leave by {{time}} · {{count}} min drive",
              time: time(advice.leaveAt),
              count: Math.round(travel.seconds / 60),
            })}
      </span>
    </div>
  )
}
