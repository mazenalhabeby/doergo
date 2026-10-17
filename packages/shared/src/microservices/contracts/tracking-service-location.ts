/** Message contracts for tracking-service `location` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const trackingHealth = rpc<Record<string, never>>('tracking_health');
export const updateLocation = rpc<{
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
  organizationId?: string;
}>('update_location');
export const updateLocationBatch = rpc<{
  userId: string;
  taskId?: string;
  organizationId?: string;
  points: { lat: number; lng: number; accuracy?: number; timestamp?: string }[];
}>('update_location_batch');
export const getActiveWorkers = rpc<{
  organizationId?: string;
  scopeSpaceIds?: string[];
  /** Sent by the gateway; tracking-service does not read it. */
  dispatcherId?: string;
}>('get_active_workers');
export const getSpaceWorkers = rpc<{ organizationId: string; userIds: string[] }>('get_space_workers');
export const getWorkerLocation = rpc<{
  workerId: string;
  organizationId?: string;
  scopeSpaceIds?: string[];
  /** Sent by the gateway; tracking-service does not read it. */
  dispatcherId?: string;
}>('get_worker_location');
export const getWorkerHistory = rpc<{
  workerId: string;
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  scopeSpaceIds?: string[];
  /** Sent by the gateway; tracking-service does not read it. */
  dispatcherId?: string;
}>('get_worker_history');
export const getTaskRoute = rpc<{ taskId: string; organizationId?: string; scopeSpaceIds?: string[] }>(
  'get_task_route',
);
export const getWorkerCurrentRoute = rpc<{ workerId: string; organizationId?: string; scopeSpaceIds?: string[] }>(
  'get_worker_current_route',
);
