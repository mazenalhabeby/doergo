"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobTimeAt } from "@hbcfield/shared/client"
import { tasksApi } from "@/lib/api"

/**
 * A job's time (packages/shared/src/tasks/job-time.ts), read once and ticked
 * forward on screen while it is live. ONE source for the pill under the job's
 * title and the job-time card — two readings of "how long" on one page must
 * never disagree (the pill used to count from Accepted, nights and all).
 */
export function useJobTime(taskId: string | null | undefined, paused = false) {
  const { data } = useQuery({
    queryKey: keys.tasks.time(taskId),
    queryFn: () => tasksApi.jobTime(taskId!),
    enabled: !!taskId,
    staleTime: 60_000,
  })
  const [now, setNow] = useState(() => Date.now())
  const ticking = !!data?.live && !paused
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [ticking])
  return { data, time: jobTimeAt(data, null, now), live: ticking }
}
