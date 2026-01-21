"use client";

import { WorkerLocation } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { MapPin, User, Clock, Briefcase, Wifi, WifiOff } from "lucide-react";

interface TechnicianListProps {
  workers: WorkerLocation[];
  selectedWorkerId: string | null;
  onWorkerSelect: (workerId: string | null) => void;
  isLoading?: boolean;
}

// Check if worker is online (updated within last 5 minutes)
function isWorkerOnline(updatedAt: string | undefined) {
  if (!updatedAt) return false;
  const lastUpdate = new Date(updatedAt);
  if (isNaN(lastUpdate.getTime())) return false;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastUpdate > fiveMinutesAgo;
}

// Safely format date
function formatLastUpdate(updatedAt: string | undefined) {
  if (!updatedAt) return "Unknown";
  const date = new Date(updatedAt);
  if (isNaN(date.getTime())) return "Unknown";
  return formatDistanceToNow(date, { addSuffix: true });
}

export default function TechnicianList({
  workers,
  selectedWorkerId,
  onWorkerSelect,
  isLoading = false,
}: TechnicianListProps) {
  // Sort workers: online first, then by last update time
  const sortedWorkers = [...workers].sort((a, b) => {
    const aOnline = isWorkerOnline(a.updatedAt);
    const bOnline = isWorkerOnline(b.updatedAt);

    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;

    // Handle undefined dates
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  const onlineCount = workers.filter((w) => isWorkerOnline(w.updatedAt)).length;

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b bg-slate-50">
          <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-slate-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50">
        <h3 className="font-semibold text-slate-900">Technicians</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          {onlineCount} online / {workers.length} total
        </p>
      </div>

      {/* Worker list */}
      <div className="flex-1 overflow-y-auto">
        {sortedWorkers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <User className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">No technicians tracked</p>
            <p className="text-xs text-slate-400 mt-1">
              Technicians will appear here when they enable location tracking
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {sortedWorkers.map((worker) => {
              const online = isWorkerOnline(worker.updatedAt);
              const isSelected = selectedWorkerId === worker.id;

              return (
                <button
                  key={worker.id}
                  onClick={() =>
                    onWorkerSelect(isSelected ? null : worker.id)
                  }
                  className={cn(
                    "w-full p-4 text-left transition-colors hover:bg-slate-50",
                    isSelected && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        online
                          ? "bg-green-100 text-green-600"
                          : "bg-slate-100 text-slate-400"
                      )}
                    >
                      <User className="w-5 h-5" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 truncate">
                          {worker.firstName} {worker.lastName}
                        </span>
                        {online ? (
                          <Wifi className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        )}
                      </div>

                      {/* Last update time */}
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatLastUpdate(worker.updatedAt)}</span>
                      </div>

                      {/* Current task */}
                      {worker.currentTask && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                          <Briefcase className="w-3 h-3" />
                          <span className="truncate">
                            {worker.currentTask.title}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Location indicator */}
                    <MapPin
                      className={cn(
                        "w-4 h-4 flex-shrink-0",
                        isSelected ? "text-blue-500" : "text-slate-300"
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with stats */}
      <div className="p-3 border-t bg-slate-50">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Online ({onlineCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Offline ({workers.length - onlineCount})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
