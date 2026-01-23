"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import {
  Route,
  Navigation,
  Timer,
  MapPin,
  Car,
  Flag,
  Gauge,
  Map,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Dynamic import for map to avoid SSR issues
const RouteMapView = dynamic(() => import("./route-map-view"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-slate-100 rounded-xl flex items-center justify-center">
      <div className="flex items-center gap-2 text-slate-400">
        <Map className="size-5 animate-pulse" />
        <span className="text-sm">Loading map...</span>
      </div>
    </div>
  ),
})

interface RoutePoint {
  lat: number
  lng: number
  timestamp: string
}

interface RouteData {
  distance: number | null
  duration: number | null // API returns seconds
  points: RoutePoint[]
  status: string
  startTime: string | null
  endTime: string | null
}

interface RouteTrackingSectionProps {
  routeData: RouteData | null | undefined
  isLoading: boolean
  hasAssignee: boolean
}

// Format distance in km or m
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

// Format duration in human readable
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMins = minutes % 60
    return `${hours}h ${remainingMins}m`
  }
  if (minutes > 0) {
    const remainingSecs = seconds % 60
    return `${minutes}m ${remainingSecs}s`
  }
  return `${seconds}s`
}

// Calculate average speed in km/h
function calculateAverageSpeed(distanceMeters: number | null, durationMs: number | null): string {
  if (!distanceMeters || !durationMs || durationMs === 0) return "—"
  const hours = durationMs / (1000 * 60 * 60)
  const km = distanceMeters / 1000
  const speed = km / hours
  if (speed < 1) return "< 1 km/h"
  return `${Math.round(speed)} km/h`
}

// Live elapsed time hook
function useLiveElapsedTime(startTime: string | null, isLive: boolean) {
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

export function RouteTrackingSection({
  routeData,
  isLoading,
  hasAssignee,
}: RouteTrackingSectionProps) {
  const [showMap, setShowMap] = useState(false)
  const isLive = routeData?.status === "EN_ROUTE"
  const liveElapsed = useLiveElapsedTime(routeData?.startTime || null, isLive)

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="p-6">
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    )
  }

  // No route data for assigned task - show waiting state
  if (hasAssignee && !routeData?.points?.length && !routeData?.distance) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Route className="size-5 text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900">Route Tracking</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
            <div className="size-12 rounded-xl bg-slate-100 flex items-center justify-center">
              <Car className="size-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Waiting for technician</p>
              <p className="text-xs text-slate-500">
                Route tracking will begin when the technician starts driving to your location
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No route data at all
  if (!routeData || (routeData.points.length === 0 && !routeData.distance)) {
    return null
  }

  // Determine route stage
  const getRouteStage = () => {
    if (routeData.status === "EN_ROUTE") return "driving"
    if (routeData.endTime) return "arrived"
    return "completed"
  }

  const stage = getRouteStage()
  // API returns duration in seconds, convert to milliseconds for consistency
  // Live elapsed is already in milliseconds
  const displayDuration = isLive ? liveElapsed : ((routeData.duration || 0) * 1000)
  const hasRoutePoints = routeData.points.length > 1

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-slate-900">Route Tracking</h3>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
              Live
            </span>
          )}
          {stage === "arrived" && !isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              Completed
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Stats Row */}
        <div className="flex gap-6 mb-6">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-slate-400" />
            <span className="text-sm text-slate-500">Avg Speed:</span>
            <span className="text-sm font-semibold text-slate-700">
              {calculateAverageSpeed(routeData.distance, displayDuration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-slate-400" />
            <span className="text-sm text-slate-500">GPS Points:</span>
            <span className="text-sm font-semibold text-slate-700">
              {routeData.points.length}
            </span>
          </div>
        </div>

        {/* Route Journey Visual */}
        <div className="border border-slate-100 rounded-xl p-4">
          <div className="flex items-center">
            {/* Start point */}
            <div className="flex flex-col items-center">
              <div className="size-10 rounded-full flex items-center justify-center bg-slate-100">
                <Navigation className="size-4 text-slate-600" />
              </div>
              <p className="text-[10px] font-medium text-slate-500 mt-1.5">Start</p>
              <p className="text-[10px] text-slate-400">
                {routeData.startTime
                  ? new Date(routeData.startTime).toLocaleString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>

            {/* Journey line */}
            <div className="flex-1 mx-4 relative">
              {/* Base track */}
              <div className="h-1 bg-slate-100 rounded-full" />

              {/* Completed track */}
              <div
                className="absolute top-0 left-0 h-1 rounded-full bg-slate-300 transition-all duration-500"
                style={{ width: "100%" }}
              />

              {/* Live: Animated car traveling */}
              {isLive && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ animation: "carTravel 3s ease-in-out infinite" }}
                >
                  <div className="relative">
                    <div className="absolute -inset-1 bg-slate-200 rounded-full animate-ping opacity-50" />
                    <div className="relative size-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                      <Car className="size-3 text-slate-600" />
                    </div>
                  </div>
                </div>
              )}

              {/* Stats badge in center */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                  <div className="flex items-center gap-1">
                    <Route className="size-3 text-slate-400" />
                    <span className="text-[11px] font-semibold text-slate-700">
                      {routeData.distance !== null ? formatDistance(routeData.distance) : "—"}
                    </span>
                  </div>
                  <div className="w-px h-3 bg-slate-200" />
                  <div className="flex items-center gap-1">
                    <Timer className="size-3 text-slate-400" />
                    <span className="text-[11px] font-semibold text-slate-700 tabular-nums">
                      {formatDuration(displayDuration)}
                    </span>
                    {isLive && <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />}
                  </div>
                </div>
              </div>
            </div>

            {/* End point */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "size-10 rounded-full flex items-center justify-center",
                isLive
                  ? "bg-white border-2 border-dashed border-slate-200"
                  : "bg-slate-100"
              )}>
                <Flag className={cn("size-4", isLive ? "text-slate-400" : "text-slate-600")} />
              </div>
              <p className="text-[10px] font-medium text-slate-500 mt-1.5">
                {isLive ? "Destination" : "Arrived"}
              </p>
              <p className="text-[10px] text-slate-400">
                {routeData.endTime
                  ? new Date(routeData.endTime).toLocaleString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : isLive ? "In transit" : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Live tracking info */}
        {isLive && routeData.points.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Live tracking active</span>
            <span>
              Last update: {new Date(routeData.points[routeData.points.length - 1].timestamp).toLocaleString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </span>
          </div>
        )}

        {/* View Route on Map Button */}
        {hasRoutePoints && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              onClick={() => setShowMap(!showMap)}
            >
              <Map className="size-4 mr-2" />
              {showMap ? "Hide Route Map" : "View Route on Map"}
              {showMap ? (
                <ChevronUp className="size-4 ml-2" />
              ) : (
                <ChevronDown className="size-4 ml-2" />
              )}
            </Button>

            {/* Inline Map */}
            {showMap && (
              <div className="mt-4">
                <RouteMapView
                  points={routeData.points}
                  isLive={isLive}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
