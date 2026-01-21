"use client"

import { useRouter } from "next/navigation"
import { Route, Navigation, Timer, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatDuration, formatDistance } from "@/lib/utils"

interface RoutePoint {
  lat: number
  lng: number
  timestamp: string
}

interface RouteData {
  distance: number | null
  duration: number | null
  points: RoutePoint[]
  status: string
  startTime: string | null
  endTime: string | null
}

interface RouteTrackingSectionProps {
  taskId: string
  routeData: RouteData | null | undefined
  isLoading: boolean
  hasAssignee: boolean
}

export function RouteTrackingSection({
  taskId,
  routeData,
  isLoading,
  hasAssignee,
}: RouteTrackingSectionProps) {
  const router = useRouter()

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Route className="size-5 text-slate-300" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    )
  }

  // No route data for assigned task
  if (hasAssignee && !routeData?.points?.length && !routeData?.distance) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Route className="size-5 text-slate-400" />
          <h3 className="text-base font-semibold text-gray-900">
            Route Tracking
          </h3>
        </div>
        <p className="text-sm text-slate-500">
          No route data available. Route tracking begins when the technician
          starts driving (EN_ROUTE status).
        </p>
      </div>
    )
  }

  // No route data at all
  if (!routeData || (routeData.points.length === 0 && !routeData.distance)) {
    return null
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Route className="size-5 text-blue-600" />
        <h3 className="text-base font-semibold text-gray-900">Route Tracking</h3>
        {routeData.status === "EN_ROUTE" && (
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
            Live
          </span>
        )}
      </div>

      {/* Route Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Navigation className="size-4" />
            <span className="text-xs font-medium">Distance</span>
          </div>
          <p className="text-xl font-semibold text-slate-900">
            {routeData.distance !== null
              ? formatDistance(routeData.distance)
              : "N/A"}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Timer className="size-4" />
            <span className="text-xs font-medium">Time on Road</span>
          </div>
          <p className="text-xl font-semibold text-slate-900">
            {routeData.duration !== null
              ? formatDuration(routeData.duration)
              : "N/A"}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <MapPin className="size-4" />
            <span className="text-xs font-medium">Tracking Points</span>
          </div>
          <p className="text-xl font-semibold text-slate-900">
            {routeData.points.length}
          </p>
        </div>
      </div>

      {/* Route Timeline */}
      <div className="border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-slate-500">Started</p>
            <p className="font-medium text-slate-900">
              {routeData.startTime
                ? new Date(routeData.startTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Not started"}
            </p>
          </div>
          <div className="flex-1 mx-4 border-t-2 border-dashed border-slate-300 relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 size-2 rounded-full bg-green-500" />
            <div
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 size-2 rounded-full",
                routeData.endTime ? "bg-blue-500" : "bg-slate-300"
              )}
            />
          </div>
          <div className="text-right">
            <p className="text-slate-500">Arrived</p>
            <p className="font-medium text-slate-900">
              {routeData.endTime
                ? new Date(routeData.endTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "In progress..."}
            </p>
          </div>
        </div>
      </div>

      {/* View on Map Link */}
      {routeData.points.length > 0 && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            size="sm"
            className="text-blue-600"
            onClick={() => router.push(`/live-map?taskId=${taskId}`)}
          >
            <MapPin className="size-4 mr-2" />
            View Route on Live Map
          </Button>
        </div>
      )}
    </div>
  )
}
