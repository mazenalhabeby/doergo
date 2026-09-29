import * as Location from 'expo-location';
import { TaskStatus } from '../../lib/api';

/**
 * Where the member is, for the task statuses that are judged by it.
 *
 * ⚠️ ONE COPY. The task screen and the home widget both move a task to
 * ARRIVED / IN_PROGRESS; a second copy of this is how one of them stops
 * sending the accuracy and a member at the customer's door is refused for
 * being 35 metres out.
 */
interface StatusFix {
  lat: number;
  lng: number;
  /** The device's own error radius — the server widens the zone by it. */
  accuracy?: number;
  /** When the fix was taken: a change sent later is judged by the tap. */
  fixAt?: string;
  mocked?: boolean;
}

const JUDGED_BY_LOCATION: string[] = [TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];

/** `undefined` when the status is not judged by location, or no fix could be had. */
export async function takeStatusFix(to: string): Promise<StatusFix | undefined> {
  if (!JUDGED_BY_LOCATION.includes(to)) return undefined;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return undefined;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      fixAt: new Date(loc.timestamp).toISOString(),
      mocked: (loc as { mocked?: boolean }).mocked ?? false,
    };
  } catch {
    // No fix — the server rejects if the task needs one, with its own reason.
    return undefined;
  }
}

/** The outbox's shape: a fix is only sent whole. */
export function outboxFix(f: StatusFix | undefined) {
  return f && f.accuracy !== undefined && f.fixAt
    ? { lat: f.lat, lng: f.lng, accuracy: f.accuracy, fixAt: f.fixAt, mocked: f.mocked }
    : null;
}

/**
 * Where a task is being driven to, for the route tracker — it recognises
 * arrival from the route it is already recording (`services/route-arrival.ts`).
 * A task without coordinates simply gets no arrival prompt.
 */
export function taskDestination(task: { locationLat?: number | null; locationLng?: number | null; locationAddress?: string | null }) {
  return { lat: task.locationLat ?? undefined, lng: task.locationLng ?? undefined, address: task.locationAddress ?? undefined };
}
