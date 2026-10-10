

// Worker location types for tracking
export interface WorkerLocation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt?: string;
  currentTaskId?: string;
  currentTask?: {
    id: string;
    title: string;
    status: string;
  };
}


// Route tracking types
interface RoutePoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: string;
}


export interface TaskRoute {
  taskId: string;
  workerId: string | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  duration: number | null; // seconds
  distance: number | null; // meters
  points: RoutePoint[];
  /** Road-snapped path [lat, lng], computed server-side. Null when route
   *  matching isn't configured — the map then draws the raw points. */
  matchedPath?: [number, number][] | null;
}
