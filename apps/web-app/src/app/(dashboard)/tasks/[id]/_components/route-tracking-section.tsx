"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
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
import { cn, formatDurationMs } from "@/lib/utils"

// Map loading placeholder (own component so it can use translations)
function MapLoading() {
  const { t } = useTranslation()
  return (
    <div className="h-64 bg-muted rounded-xl flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Map className="size-5 animate-pulse" />
        <span className="text-sm">{t("common.loadingMap")}</span>
      </div>
    </div>
  )
}

// Dynamic import for map to avoid SSR issues
const RouteMapView = dynamic(() => import("./route-map-view"), {
  ssr: false,
  loading: () => <MapLoading />,
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
  /** Road-snapped path from the server; absent when matching isn't configured. */
  matchedPath?: [number, number][] | null
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
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  const [showMap, setShowMap] = useState(true)
  const isLive = routeData?.status === "EN_ROUTE"
  const liveElapsed = useLiveElapsedTime(routeData?.startTime || null, isLive)

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
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
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Route className="size-5 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">{t("tasks.sections.routeTracking")}</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-xl">
            <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
              <Car className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t("tasks.route.waitingForTechnician")}</p>
              <p className="text-xs text-muted-foreground">
                {t("tasks.route.waitingDescription")}
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
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-foreground">{t("tasks.sections.routeTracking")}</h3>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
              <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
              {t("tasks.route.live")}
            </span>
          )}
          {stage === "arrived" && !isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              {t("tasks.statusTabs.COMPLETED")}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Stats Row */}
        <div className="flex gap-6 mb-6">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("tasks.route.avgSpeed")}</span>
            <span className="text-sm font-semibold text-foreground">
              {calculateAverageSpeed(routeData.distance, displayDuration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("tasks.route.gpsPoints")}</span>
            <span className="text-sm font-semibold text-foreground">
              {routeData.points.length}
            </span>
          </div>
        </div>

        {/* Route Journey Visual */}
        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center">
            {/* Start point */}
            <div className="flex flex-col items-center">
              <div className="size-10 rounded-full flex items-center justify-center bg-muted">
                <Navigation className="size-4 text-muted-foreground" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-1.5">{t("tasks.route.start")}</p>
              <p className="text-[10px] text-muted-foreground">
                {routeData.startTime ? formatTime(routeData.startTime) : "—"}
              </p>
            </div>

            {/* Journey line */}
            <div className="flex-1 mx-4 relative">
              {/* Base track */}
              <div className="h-1 bg-muted rounded-full" />

              {/* Completed track */}
              <div
                className="absolute top-0 left-0 h-1 rounded-full bg-muted-foreground transition-all duration-500"
                style={{ width: "100%" }}
              />

              {/* Live: Animated car traveling */}
              {isLive && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ animation: "carTravel 3s ease-in-out infinite" }}
                >
                  <div className="relative">
                    <div className="absolute -inset-1 bg-muted rounded-full animate-ping opacity-50" />
                    <div className="relative size-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center">
                      <Car className="size-3 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              )}

              {/* Stats badge in center */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full shadow-sm">
                  <div className="flex items-center gap-1">
                    <Route className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground">
                      {routeData.distance !== null ? formatDistance(routeData.distance) : "—"}
                    </span>
                  </div>
                  <div className="w-px h-3 bg-muted" />
                  <div className="flex items-center gap-1">
                    <Timer className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground tabular-nums">
                      {formatDurationMs(displayDuration)}
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
                  ? "bg-card border-2 border-dashed border-border"
                  : "bg-muted"
              )}>
                <Flag className={cn("size-4", isLive ? "text-muted-foreground" : "text-muted-foreground")} />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-1.5">
                {isLive ? t("tasks.route.destination") : t("tasks.route.arrived")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {routeData.endTime
                  ? formatTime(routeData.endTime)
                  : isLive ? t("tasks.route.inTransit") : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Live tracking info */}
        {isLive && routeData.points.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("tasks.route.liveTrackingActive")}</span>
            <span>
              {t("tasks.route.lastUpdate", { time: formatTime(routeData.points[routeData.points.length - 1].timestamp) })}
            </span>
          </div>
        )}

        {/* View Route on Map Button */}
        {hasRoutePoints && (
          <div className="mt-5 pt-5 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center rounded-xl border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setShowMap(!showMap)}
            >
              <Map className="size-4 mr-2" />
              {showMap ? t("tasks.route.hideMap") : t("tasks.route.viewMap")}
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
                  matchedPath={routeData.matchedPath}
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
