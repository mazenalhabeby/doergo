/** task-service: leaving the site during a shift — report, approve, reject, list. */
import { rpc } from '../contract';
import type { AttendanceScope } from '../../access/space-scope';

export const reportGeofenceExcursion = rpc<{
  userId: string;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
  reason: string;
  requestedMinutes: number;
}>('report_geofence_excursion');

export const approveGeofenceExcursion = rpc<{
  scopeSpaceIds?: AttendanceScope;
  excursionId: string;
  approverId: string;
  organizationId: string;
  grantedMinutes?: number;
}>('approve_geofence_excursion');

export const rejectGeofenceExcursion = rpc<{
  scopeSpaceIds?: AttendanceScope;
  excursionId: string;
  approverId: string;
  organizationId: string;
}>('reject_geofence_excursion');

export const listGeofenceExcursions = rpc<{
  organizationId: string;
  status?: 'active' | 'pending' | 'approved';
  scopeSpaceIds?: AttendanceScope;
}>('list_geofence_excursions');
