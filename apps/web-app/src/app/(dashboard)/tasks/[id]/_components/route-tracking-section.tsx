"use client"

import { useState, memo } from "react"
import { useTranslation } from "react-i18next"
import { useTimeFormat, useFormatDistance } from "@/hooks"
import dynamic from "next/dynamic"
import { Route, Navigation, Timer, MapPin, Car, Flag, Gauge, Map, ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { type RouteData, AverageSpeedValue, DurationValue } from "./route-tracking-values"

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
// Memoised: the task page re-renders for many reasons (comments, timers,
// socket updates); the map only needs to when its points change, and TanStack
// Query keeps the points array's identity until the data really changes.
const RouteMapView = memo(
  dynamic(() => import("./route-map-view"), {
    ssr: false,
    loading: () => <MapLoading />,
  }),
)

interface RouteTrackingSectionProps {
  routeData: RouteData | null | undefined
  isLoading: boolean
  hasAssignee: boolean
}

export function RouteTrackingSection({ routeData, isLoading, hasAssignee }: RouteTrackingSectionProps) {
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  const formatDistance = useFormatDistance()
  const [showMap, setShowMap] = useState(true)
  const isLive = routeData?.status === "EN_ROUTE"

  // Loading state
  if (isLoading) {
    return <Skeleton className="h-20 rounded-xl" />
  }

  // No route data for assigned task - show waiting state
  if (hasAssignee && !routeData?.points?.length && !routeData?.distance) {
    return (
      <div>
        <div className="flex items-center gap-4 p-4 bg-muted rounded-xl">
          <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
            <Car className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t("tasks.route.waitingForTechnician")}</p>
            <p className="text-xs text-muted-foreground">{t("tasks.route.waitingDescription")}</p>
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
  const hasRoutePoints = routeData.points.length > 1

  return (
    <div>
      {/*
        No card and no title here — CollapsibleSection draws both, and drawing
        them again produced a panel headed Route Tracking containing a box
        headed Route Tracking. The live/finished badge stays: it says something
        the section header does not.
      */}
      {(isLive || stage === "arrived") && (
        <div className="flex items-center gap-3 mb-4">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
              <span className="size-1.5 rounded-full bg-shell-accent animate-pulse" />
              {t("tasks.route.live")}
            </span>
          )}
          {stage === "arrived" && !isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              {t("tasks.statusTabs.COMPLETED")}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div>
        {/* Stats Row */}
        <div className="flex gap-6 mb-6">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("tasks.route.avgSpeed")}</span>
            <span className="text-sm font-semibold text-foreground">
              <AverageSpeedValue routeData={routeData} isLive={isLive} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("tasks.route.gpsPoints")}</span>
            <span className="text-sm font-semibold text-foreground">{routeData.points.length}</span>
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
                      {formatDistance(routeData.distance)}
                    </span>
                  </div>
                  <div className="w-px h-3 bg-muted" />
                  <div className="flex items-center gap-1">
                    <Timer className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground tabular-nums">
                      <DurationValue routeData={routeData} isLive={isLive} />
                    </span>
                    {isLive && <span className="size-1.5 rounded-full bg-shell-accent animate-pulse" />}
                  </div>
                </div>
              </div>
            </div>

            {/* End point */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "size-10 rounded-full flex items-center justify-center",
                  isLive ? "bg-card border-2 border-dashed border-border" : "bg-muted",
                )}
              >
                <Flag className={cn("size-4", isLive ? "text-muted-foreground" : "text-muted-foreground")} />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-1.5">
                {isLive ? t("tasks.route.destination") : t("tasks.route.arrived")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {routeData.endTime ? formatTime(routeData.endTime) : isLive ? t("tasks.route.inTransit") : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Live tracking info */}
        {isLive && routeData.points.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("tasks.route.liveTrackingActive")}</span>
            <span>
              {t("tasks.route.lastUpdate", {
                time: formatTime(routeData.points[routeData.points.length - 1].timestamp),
              })}
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
              {showMap ? <ChevronUp className="size-4 ml-2" /> : <ChevronDown className="size-4 ml-2" />}
            </Button>

            {/* Inline Map */}
            {showMap && (
              <div className="mt-4">
                <RouteMapView points={routeData.points} matchedPath={routeData.matchedPath} isLive={isLive} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
