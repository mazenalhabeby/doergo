import { Ionicons } from '@expo/vector-icons';
import { TaskStatus } from '../../lib/api';

// Progress steps configuration for the detail view (6-step flow)
export const PROGRESS_STEPS = [
  { key: TaskStatus.ASSIGNED, label: 'Assigned', icon: 'checkmark' as const },
  { key: TaskStatus.ACCEPTED, label: 'Accepted', icon: 'checkmark' as const },
  { key: TaskStatus.EN_ROUTE, label: 'On The Way', icon: 'car' as const },
  { key: TaskStatus.ARRIVED, label: 'Arrived', icon: 'location' as const },
  { key: TaskStatus.IN_PROGRESS, label: 'In Progress', icon: 'construct' as const },
  { key: TaskStatus.COMPLETED, label: 'Completed', icon: 'checkmark' as const },
] as const;

// Map task status to progress step index (specific to the 6-step detail view)
export function getDetailProgressIndex(status: string): number {
  switch (status) {
    case TaskStatus.ASSIGNED:
      return 0;
    case TaskStatus.ACCEPTED:
      return 1;
    case TaskStatus.EN_ROUTE:
      return 2;
    case TaskStatus.ARRIVED:
      return 3;
    case TaskStatus.IN_PROGRESS:
      return 4;
    case TaskStatus.COMPLETED:
    case TaskStatus.CLOSED:
      return 5;
    case TaskStatus.BLOCKED:
      return 4; // Show as at in-progress step
    default:
      return -1;
  }
}

// Get next status action based on current status
export interface StatusAction {
  nextStatus: TaskStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function getStatusAction(status: string): StatusAction | null {
  switch (status) {
    case TaskStatus.ASSIGNED:
      return { nextStatus: TaskStatus.ACCEPTED, label: 'Accept Job', icon: 'checkmark-circle' };
    case TaskStatus.ACCEPTED:
      return { nextStatus: TaskStatus.EN_ROUTE, label: 'Start Driving', icon: 'car' };
    case TaskStatus.EN_ROUTE:
      return { nextStatus: TaskStatus.ARRIVED, label: "I've Arrived", icon: 'location' };
    case TaskStatus.ARRIVED:
      return { nextStatus: TaskStatus.IN_PROGRESS, label: 'Start Work', icon: 'construct' };
    case TaskStatus.IN_PROGRESS:
      return { nextStatus: TaskStatus.COMPLETED, label: 'Finish Job', icon: 'checkmark-done' };
    case TaskStatus.BLOCKED:
      return { nextStatus: TaskStatus.IN_PROGRESS, label: 'Resume Job', icon: 'play' };
    default:
      return null;
  }
}

// Format elapsed time for timer display (HH:MM:SS)
/** Human-readable elapsed time in days/hours/minutes: "34d 23h 11m" / "2h 5m". */
export function formatElapsedTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}
