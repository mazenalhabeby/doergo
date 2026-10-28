import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { approvalsApi } from '@/lib/api';
import { manageRowsFor } from '@/lib/manage-rows';
import { watchApprovalsCount, type WaitingState } from './approvals-waiting-read';

/**
 * How many approvals this member can act on now (`/approvals/count` → `actionable`, cached ~20 s on the server):
 * items not half-way, or half-way and waiting for them — never one that waits for somebody else's approval, so
 * "N approvals wait for your decision" is true. Read every time home is shown; only for somebody who has the
 * Approvals row. Online only, like the inbox: a failed read shows nothing rather than an old number.
 * `ready` turns true once the first answer (or failure) is in, or after 1.5 s at the latest.
 */
export function useApprovalsWaiting(): WaitingState {
  const { user } = useAuth();
  const allowed = useMemo(() => manageRowsFor(user || {}).some((r) => r.route === '/(app)/approvals'), [user]);
  const [state, setState] = useState<WaitingState>({ count: 0, ready: false });
  useFocusEffect(
    useCallback(() => {
      if (!allowed) {
        setState({ count: 0, ready: true });
        return;
      }
      return watchApprovalsCount(() => approvalsApi.count(), setState);
    }, [allowed]),
  );
  return state;
}
