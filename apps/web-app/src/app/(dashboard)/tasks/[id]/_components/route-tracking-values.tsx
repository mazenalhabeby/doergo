"use client"

import { useState, useEffect } from "react"
import { formatDurationMs } from "@/lib/utils"

/** A tracked route's shape, and its live duration and average speed — moved here unchanged. */
export interface RoutePoint {
  lat: number
  lng: number
  timestamp: string
}

export interface RouteData {
  distance: number | null
  duration: number | null // API returns seconds
  points: RoutePoint[]
  /** Road-snapped path from the server; absent when matching isn't configured. */
  matchedPath?: [number, number][] | null
  status: string
  startTime: string | null
  endTime: string | null
}

// Calculate average speed in km/h
export function calculateAverageSpeed(distanceMeters: number | null, durationMs: number | null): string {
  if (!distanceMeters || !durationMs || durationMs === 0) return "—"
  const hours = durationMs / (1000 * 60 * 60)
  const km = distanceMeters / 1000
  const speed = km / hours
  if (speed < 1) return "< 1 km/h"
  return `${Math.round(speed)} km/h`
}

// Live elapsed time hook
export function useLiveElapsedTime(startTime: string | null, isLive: boolean) {
  const [elapsed, setElapsed] = useState<number>(0)

  useEffect(() => {
    if (!startTime || !isLive) return

    const start = new Date(startTime).getTime()

    const updateElapsed = () => {
      setElapsed(Date.now() - start)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [startTime, isLive])

  return elapsed
}

/*
  The live clock ticks once a second while a route is EN_ROUTE. It used to tick
  at the section's root, so the whole section — Leaflet map included —
  re-rendered every second for as long as a drive lasted. Only these two little
  readouts depend on it, so only they own the ticker; the map renders when the
  route data changes.
*/
export function useDisplayDuration(routeData: RouteData, isLive: boolean): number {
  const liveElapsed = useLiveElapsedTime(routeData.startTime || null, isLive)
  // API returns duration in seconds, convert to milliseconds for consistency.
  // Live elapsed is already in milliseconds.
  return isLive ? liveElapsed : (routeData.duration || 0) * 1000
}

export function AverageSpeedValue({ routeData, isLive }: { routeData: RouteData; isLive: boolean }) {
  const duration = useDisplayDuration(routeData, isLive)
  return <>{calculateAverageSpeed(routeData.distance, duration)}</>
}

export function DurationValue({ routeData, isLive }: { routeData: RouteData; isLive: boolean }) {
  const duration = useDisplayDuration(routeData, isLive)
  return <>{formatDurationMs(duration)}</>
}
