import { useMemo } from 'react';
import { useSyncStatus } from '../offline-context';
import type { OutboxOp } from '../outbox/types';
import { refusedShiftOps } from './refused-shift';

/** The newest refused clock-in, clock-out or rest the member has not dealt with, or null. */
export function useRefusedShift(): OutboxOp | null {
  const { operations } = useSyncStatus();
  return useMemo(() => refusedShiftOps(operations)[0] ?? null, [operations]);
}
