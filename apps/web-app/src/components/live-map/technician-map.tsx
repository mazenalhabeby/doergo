"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { WorkerLocation, WorkerCurrentRoute, trackingApi } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

// Fix Leaflet default icon issue with Next.js
const createTechnicianIcon = (isOnline: boolean) => {
  return L.divIcon({
    className: "technician-marker",
    html: `
      <div class="relative">
        <div class="w-10 h-10 rounded-full ${
          isOnline ? "bg-green-500" : "bg-slate-400"
        } border-4 border-white shadow-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        ${
          isOnline
            ? '<div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>'
            : ""
        }
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

// Component to handle map bounds fitting
function MapBounds({ workers }: { workers: WorkerLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (workers.length === 0) return;

    const bounds = L.latLngBounds(
      workers.map((w) => [w.lat, w.lng] as [number, number])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [map, workers]);

  return null;
}

// Component to center map on selected worker
function CenterOnWorker({
  selectedWorkerId,
  workers,
}: {
  selectedWorkerId: string | null;
  workers: WorkerLocation[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedWorkerId) return;

    const worker = workers.find((w) => w.id === selectedWorkerId);
    if (worker) {
      map.setView([worker.lat, worker.lng], 16, { animate: true });
    }
  }, [map, selectedWorkerId, workers]);

  return null;
}

// Component to show route polyline
function RoutePolyline({ route }: { route: WorkerCurrentRoute | null }) {
  if (!route || route.points.length < 2) return null;

  const positions = route.points.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <>
      {/* Route polyline */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: "#3b82f6",
          weight: 4,
          opacity: 0.8,
        }}
      />
      {/* Start point marker */}
      <CircleMarker
        center={positions[0]}
        radius={8}
        pathOptions={{
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 1,
        }}
      />
      {/* Destination marker (if available) */}
      {route.destination && (
        <CircleMarker
          center={[route.destination.lat, route.destination.lng]}
          radius={10}
          pathOptions={{
            color: "#ef4444",
            fillColor: "#ef4444",
            fillOpacity: 0.7,
          }}
        />
      )}
    </>
  );
}

// Format duration in human-readable format
function formatDuration(seconds: number | null): string {
  if (seconds === null) return "N/A";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

// Format distance in human-readable format
function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "N/A";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface TechnicianMapProps {
  workers: WorkerLocation[];
  selectedWorkerId: string | null;
  onWorkerSelect: (workerId: string | null) => void;
}

export default function TechnicianMap({
  workers,
  selectedWorkerId,
  onWorkerSelect,
}: TechnicianMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [currentRoute, setCurrentRoute] = useState<WorkerCurrentRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Check if selected worker is EN_ROUTE
  const selectedWorker = selectedWorkerId
    ? workers.find((w) => w.id === selectedWorkerId)
    : null;
  const isWorkerEnRoute = selectedWorker?.currentTask?.status === "EN_ROUTE";

  // Fetch route when selected worker changes
  useEffect(() => {
    if (!selectedWorkerId) {
      setCurrentRoute(null);
      return;
    }

    const fetchRoute = async () => {
      setLoadingRoute(true);
      try {
        const route = await trackingApi.getWorkerCurrentRoute(selectedWorkerId);
        setCurrentRoute(route || null);
      } catch (error) {
        console.error("Failed to fetch route:", error);
        setCurrentRoute(null);
      } finally {
        setLoadingRoute(false);
      }
    };

    // Fetch once immediately
    fetchRoute();

    // Only poll if worker is EN_ROUTE (actively driving)
    if (!isWorkerEnRoute) {
      return; // No polling needed
    }

    // Refresh route every 15 seconds while worker is EN_ROUTE
    const interval = setInterval(fetchRoute, 15000);
    return () => clearInterval(interval);
  }, [selectedWorkerId, isWorkerEnRoute]);

  // Check if worker is online (updated within last 5 minutes)
  const isWorkerOnline = (updatedAt: string | undefined) => {
    if (!updatedAt) return false;
    const lastUpdate = new Date(updatedAt);
    if (isNaN(lastUpdate.getTime())) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastUpdate > fiveMinutesAgo;
  };

  // Safely format date
  const formatLastUpdate = (updatedAt: string | undefined) => {
    if (!updatedAt) return "Unknown";
    const date = new Date(updatedAt);
    if (isNaN(date.getTime())) return "Unknown";
    return formatDistanceToNow(date, { addSuffix: true });
  };

  // Default center (New York - matches seed data)
  const defaultCenter: [number, number] = [40.7128, -74.006];
  const defaultZoom = 12;

  // Calculate initial center from workers
  const initialCenter = useMemo(() => {
    if (workers.length === 0) return defaultCenter;
    const avgLat = workers.reduce((sum, w) => sum + w.lat, 0) / workers.length;
    const avgLng = workers.reduce((sum, w) => sum + w.lng, 0) / workers.length;
    return [avgLat, avgLng] as [number, number];
  }, [workers]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={initialCenter}
        zoom={defaultZoom}
        className="h-full w-full rounded-lg"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBounds workers={workers} />
        <CenterOnWorker selectedWorkerId={selectedWorkerId} workers={workers} />

        {/* Route visualization */}
        <RoutePolyline route={currentRoute} />

        {workers.map((worker) => {
          const online = isWorkerOnline(worker.updatedAt);
          const icon = createTechnicianIcon(online);

          return (
            <Marker
              key={worker.id}
              position={[worker.lat, worker.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onWorkerSelect(worker.id),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-slate-900">
                    {worker.firstName} {worker.lastName}
                  </div>
                  <div className="text-sm text-slate-500 mb-2">{worker.email}</div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        online
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {online ? "Online" : "Offline"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatLastUpdate(worker.updatedAt)}
                    </span>
                  </div>

                  {worker.currentTask && (
                    <div className="border-t pt-2 mt-2">
                      <div className="text-xs text-slate-500 uppercase font-medium mb-1">
                        Current Task
                      </div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {worker.currentTask.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        Status: {worker.currentTask.status.replace("_", " ")}
                      </div>
                    </div>
                  )}

                  {worker.accuracy && (
                    <div className="text-xs text-slate-400 mt-2">
                      Accuracy: ~{Math.round(worker.accuracy)}m
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Route info panel */}
      {selectedWorker && currentRoute && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">
                {selectedWorker.firstName} {selectedWorker.lastName} - En Route
              </div>
              <div className="text-xs text-slate-500 truncate max-w-[200px]">
                {currentRoute.taskTitle}
              </div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-xs text-slate-500">Distance</div>
                <div className="text-sm font-semibold text-blue-600">
                  {formatDistance(currentRoute.distance)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Time</div>
                <div className="text-sm font-semibold text-blue-600">
                  {formatDuration(currentRoute.duration)}
                </div>
              </div>
            </div>
          </div>
          {currentRoute.points.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              {currentRoute.points.length} tracking points recorded
            </div>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {loadingRoute && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-3 py-1 z-[1000]">
          <span className="text-xs text-slate-500">Loading route...</span>
        </div>
      )}
    </div>
  );
}
