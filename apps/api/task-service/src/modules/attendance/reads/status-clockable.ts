import { spaceRunsClock } from '@hbcfield/shared';
import { ATTENDANCE_LOCATION_SELECT } from '../core/attendance-selects';

/**
 * The status read's workspaces, with what is needed to say whether each would
 * TAKE a clock-in now — the same rule as `clockableWorkspaces` (the clock-in
 * list and check): assignment started, workspace active, not the Remote bucket,
 * this organization's, Time Tracking running there.
 *
 * ⚠️ The phone chooses where to clock in from this list. Built with only
 * `notEndedWhere`, it offered (and could auto-pick) a workspace whose assignment
 * starts next week or whose Time Tracking is off, and the server then refused
 * the clock-in. The list itself stays as it is — the phone also shows "where you
 * work" from it — and each workspace says whether it is clockable.
 */
export const STATUS_SPACE_SELECT = {
  ...ATTENDANCE_LOCATION_SELECT,
  isRemote: true,
  enabledModules: true,
  organization: { select: { enabledModules: true } },
} as const;

interface StatusAssignment {
  effectiveFrom: Date | null;
  space: {
    id: string;
    isActive: boolean;
    isRemote: boolean;
    organizationId: string;
    enabledModules: unknown;
    organization: { enabledModules: unknown } | null;
  };
}

export function isClockableAssignment(a: StatusAssignment, organizationId: string, now: Date): boolean {
  const s = a.space;
  return (
    (!a.effectiveFrom || a.effectiveFrom.getTime() <= now.getTime()) &&
    s.isActive &&
    !s.isRemote &&
    s.organizationId === organizationId &&
    spaceRunsClock(s.enabledModules as string[] | null, s.organization?.enabledModules as string[] | null)
  );
}

/** The space as the status reply has always sent it — the extra columns read for `clockable` stay server-side. */
export function statusSpace<T extends { isRemote: boolean; enabledModules: unknown; organization: unknown }>(
  space: T,
): Omit<T, 'isRemote' | 'enabledModules' | 'organization'> {
  const { isRemote: _r, enabledModules: _m, organization: _o, ...rest } = space;
  return rest;
}
