"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trackingApi, WorkerLocation } from "@/lib/api";
import { useWorkerLocationUpdates, WorkerLocationUpdate, SocketUser } from "@/lib/socket";
import { useAuth } from "@/contexts/auth-context";
import TechnicianList from "@/components/live-map/technician-list";
import { RefreshCw, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Dynamically import the map component to avoid SSR issues with Leaflet
const TechnicianMap = dynamic(
  () => import("@/components/live-map/technician-map"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-slate-100 rounded-lg">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

export default function LiveMapPage() {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Create socket user object from auth user
  const socketUser: SocketUser | null = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      // organizationId is not in the User type, but backend will use 'default' as fallback
    };
  }, [user]);

  // Fetch worker locations
  const {
    data: workers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["tracking", "workers"],
    queryFn: trackingApi.getWorkers,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  // Handle real-time location updates from Socket.IO
  const handleLocationUpdate = useCallback(
    (update: WorkerLocationUpdate) => {
      console.log("[LiveMap] Received location update:", update);

      // Update the query cache with new location
      queryClient.setQueryData<WorkerLocation[]>(
        ["tracking", "workers"],
        (oldData) => {
          if (!oldData) return oldData;

          return oldData.map((worker) => {
            if (worker.id === update.workerId) {
              return {
                ...worker,
                lat: update.location.lat,
                lng: update.location.lng,
                accuracy: update.location.accuracy,
                updatedAt: update.location.timestamp.toString(),
              };
            }
            return worker;
          });
        }
      );
    },
    [queryClient]
  );

  // Connect to Socket.IO for real-time updates
  const { isConnected, connectionError } = useWorkerLocationUpdates(
    handleLocationUpdate,
    socketUser,
    true
  );

  // Show connection status
  const ConnectionStatus = () => (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
        isConnected
          ? "bg-green-100 text-green-700"
          : connectionError
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {isConnected ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          <span>Live</span>
        </>
      ) : connectionError ? (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Disconnected</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>Connecting...</span>
        </>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            Failed to load map
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Map</h1>
          <p className="text-sm text-slate-500">
            Track technician locations in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Map */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border overflow-hidden">
          <TechnicianMap
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            onWorkerSelect={setSelectedWorkerId}
          />
        </div>

        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 bg-white rounded-lg shadow-sm border overflow-hidden">
          <TechnicianList
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            onWorkerSelect={setSelectedWorkerId}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
