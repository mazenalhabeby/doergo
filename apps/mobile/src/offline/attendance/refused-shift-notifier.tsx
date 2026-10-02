import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSyncStatus } from '../offline-context';
import { markRefusedShiftsKnown, notifyRefusedShifts } from './refused-shift-notify';

/**
 * Watches the outbox while the app runs. A clock-in refused while the member
 * is looking at the app is on the home card; refused while it sits in the
 * background, it becomes a notification. Renders nothing.
 */
export function RefusedShiftNotifier() {
  const { operations } = useSyncStatus();
  const started = useRef(false);
  useEffect(() => {
    // What was already refused when the app opened is on the card, not news.
    if (!started.current) {
      started.current = true;
      void markRefusedShiftsKnown(operations);
      return;
    }
    if (AppState.currentState === 'active') void markRefusedShiftsKnown(operations);
    else void notifyRefusedShifts(operations);
  }, [operations]);
  return null;
}
