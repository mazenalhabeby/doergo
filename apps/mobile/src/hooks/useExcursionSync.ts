import { useEffect } from 'react';
import { useSocketContext } from '../contexts/socket-context';

// Raw socket event names emitted by the notification-service for the out-of-ring
// workflow (employee-facing events go to the user room, responsible events to the
// org room — the employee is in both, so we filter by userId in the handler).
const EXCURSION_EVENTS = [
  'geofence_excursion_out',
  'geofence_excursion_requested',
  'geofence_excursion_approved',
  'geofence_excursion_rejected',
  'geofence_excursion_returned',
  'geofence_excursion_expired',
] as const;

/**
 * Subscribe to geofence-excursion socket events and run `onChange` when one
 * arrives — so the attendance/home screens update live instead of needing a
 * pull-to-refresh. When `userId` is passed, only events for that user fire the
 * callback (an employee ignores other workers' org-room events).
 */
export function useExcursionSync(onChange: (event: string, payload: any) => void, userId?: string) {
  const { isAuthenticated, subscribe } = useSocketContext();
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubs = EXCURSION_EVENTS.map((e) =>
      subscribe(e, (payload: any) => {
        if (userId && payload?.userId && payload.userId !== userId) return;
        onChange(e, payload);
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [isAuthenticated, subscribe, onChange, userId]);
}
